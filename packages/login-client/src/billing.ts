const DEFAULT_LOGIN_ORIGIN = 'https://login.justevery.com';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface BillingCheckoutRequest {
  /** Base origin for the login worker (defaults to https://login.justevery.com). */
  loginOrigin?: string;
  /** Explicit fetch implementation (pass a Cloudflare service binding for intra-worker calls). */
  fetchImpl?: FetchLike;
  /** Login service client id (Basic auth). */
  clientId: string;
  /** Login service client secret (Basic auth). */
  clientSecret: string;
  /** Organization to bill. */
  organizationId?: string;
  /** Stripe price ID to charge. Mutually exclusive with `productCode`. */
  priceId?: string;
  /** Logical product identifier that resolves via `STRIPE_PRODUCTS`. */
  productCode?: string;
  /** Defaults to 1. */
  quantity?: number;
  /** Success redirect URL (must pass login's allowlist). */
  successUrl: string;
  /** Cancel redirect URL (must pass login's allowlist). */
  cancelUrl: string;
  /** Optional metadata forwarded to Stripe. */
  metadata?: Record<string, string | number | boolean | null>;
  /** Optional AbortSignal. */
  signal?: AbortSignal;
}

export interface BillingCheckoutSuccess {
  organizationId: string;
  checkoutRequestId: string;
  sessionId: string;
  url: string;
  priceId: string;
  productCode: string | null;
}

export interface BillingCheckoutErrorBody {
  error?: string;
  code?: string;
  hint?: string;
  [key: string]: unknown;
}

export class BillingCheckoutError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly body?: BillingCheckoutErrorBody;

  constructor(message: string, options: { status: number; code?: string; body?: BillingCheckoutErrorBody }) {
    super(message);
    this.name = 'BillingCheckoutError';
    this.status = options.status;
    this.code = options.code;
    this.body = options.body;
  }
}

export async function createBillingCheckout(request: BillingCheckoutRequest): Promise<BillingCheckoutSuccess> {
  const {
    loginOrigin = DEFAULT_LOGIN_ORIGIN,
    fetchImpl = fetch,
    clientId,
    clientSecret,
    organizationId,
    priceId,
    productCode,
    quantity,
    successUrl,
    cancelUrl,
    metadata,
    signal,
  } = request;

  if (!clientId || !clientSecret) {
    throw new BillingCheckoutError('billing service client credentials are required', { status: 0, code: 'missing_credentials' });
  }
  if (!successUrl || !cancelUrl) {
    throw new BillingCheckoutError('Both successUrl and cancelUrl are required', {
      status: 0,
      code: 'missing_redirects',
    });
  }

  const url = buildCheckoutUrl(loginOrigin);
  const headers = new Headers({ 'content-type': 'application/json' });
  headers.set('authorization', `Basic ${encodeBase64(`${clientId}:${clientSecret}`)}`);

  const payload = pruneUndefined({
    organizationId,
    priceId,
    productCode,
    quantity: Number.isFinite(quantity) && Number(quantity) > 0 ? Number(quantity) : 1,
    successUrl,
    cancelUrl,
    metadata,
  });

  const response = await fetchImpl(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const body = await parseJson(response);
    const errorMessage = body?.error || `Checkout request failed with ${response.status}`;
    throw new BillingCheckoutError(errorMessage, {
      status: response.status,
      code: body?.code,
      body,
    });
  }

  const data = (await response.json()) as BillingCheckoutSuccess;
  if (!data || typeof data.url !== 'string' || typeof data.sessionId !== 'string') {
    throw new BillingCheckoutError('Unexpected checkout response payload', {
      status: response.status,
      body: data as unknown as BillingCheckoutErrorBody,
    });
  }
  return data;
}

function encodeBase64(value: string): string {
  if (typeof btoa === 'function') {
    return btoa(value);
  }
  return Buffer.from(value, 'utf8').toString('base64');
}

function buildCheckoutUrl(origin: string): string {
  const trimmed = origin?.trim() || DEFAULT_LOGIN_ORIGIN;
  const normalized = trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  return `${normalized}/api/billing/checkout`;
}

function pruneUndefined<T extends Record<string, unknown>>(input: T): T {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries) as T;
}

async function parseJson(response: Response): Promise<BillingCheckoutErrorBody | undefined> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return undefined;
  }
  try {
    return (await response.json()) as BillingCheckoutErrorBody;
  } catch {
    return undefined;
  }
}
