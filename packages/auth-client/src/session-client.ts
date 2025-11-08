import {
  type EmailSignInParams,
  type EmailSignUpParams,
  type PasskeyAuthParams,
  type SessionClientOptions,
  type SessionPayload,
  type SocialSignInParams,
  type VerificationEmailParams,
} from './types';

const DEFAULT_BASE_URL = 'https://login.justevery.com/api/auth';

export class SessionClientError<T = unknown> extends Error {
  readonly status: number;
  readonly payload?: T;

  constructor(message: string, status: number, payload?: T) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export class SessionClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly credentials: RequestCredentials;

  constructor(options: SessionClientOptions = {}) {
    this.baseUrl = normaliseBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    const resolvedFetch = options.fetch ?? globalThis.fetch;
    if (!resolvedFetch) {
      throw new Error('SessionClient requires a fetch implementation');
    }
    this.fetchImpl = resolvedFetch.bind(globalThis);
    this.credentials = options.credentials ?? 'include';
  }

  async getSession(): Promise<SessionPayload> {
    return this.request('/session', undefined, { method: 'GET' });
  }

  async refreshSession(): Promise<SessionPayload> {
    return this.getSession();
  }

  async signInWithEmail(params: EmailSignInParams): Promise<SessionPayload> {
    return this.request('/sign-in/email', params);
  }

  async signUpWithEmail(params: EmailSignUpParams): Promise<Record<string, unknown>> {
    return this.request('/sign-up/email', params);
  }

  async sendVerificationEmail(params: VerificationEmailParams): Promise<Record<string, unknown>> {
    return this.request('/send-verification-email', params);
  }

  async signOut(returnUrl?: string): Promise<Record<string, unknown>> {
    const body = returnUrl ? { return: returnUrl } : {};
    return this.request('/sign-out', body);
  }

  async generateSocialSignIn(params: SocialSignInParams): Promise<{ url: string }> {
    return this.request('/sign-in/social', params);
  }

  async beginPasskeyRegistration(params: Record<string, string | number | boolean>): Promise<Record<string, unknown>> {
    return this.request('/passkey/generate-register-options', undefined, {
      method: 'GET',
      searchParams: params,
    });
  }

  async verifyPasskeyRegistration(payload: PasskeyAuthParams): Promise<Record<string, unknown>> {
    return this.request('/passkey/verify-registration', payload);
  }

  async beginPasskeyAuthentication(): Promise<Record<string, unknown>> {
    return this.request('/passkey/generate-authenticate-options', undefined, { method: 'POST' });
  }

  async verifyPasskeyAuthentication(payload: PasskeyAuthParams): Promise<Record<string, unknown>> {
    return this.request('/passkey/verify-authentication', payload);
  }

  buildUiUrl(path: string, returnUrl?: string): string {
    const target = new URL(path, this.baseUrl.replace(/\/api\/auth$/, ''));
    if (returnUrl) {
      target.searchParams.set('return', toAbsoluteReturnUrl(returnUrl));
    }
    return target.toString();
  }

  private async request<T>(
    path: string,
    body?: unknown,
    init?: RequestInit & { searchParams?: Record<string, string | number | boolean | undefined> }
  ): Promise<T> {
    const method = init?.method ?? (body === undefined ? 'GET' : 'POST');
    const headers = new Headers(init?.headers);
    if (!headers.has('accept')) {
      headers.set('accept', 'application/json');
    }
    if (method !== 'GET' && method !== 'HEAD' && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    const url = this.resolveUrl(path, init?.searchParams);
    const requestInit: RequestInit = {
      ...init,
      method,
      headers,
      credentials: this.credentials,
    };

    if (method !== 'GET' && method !== 'HEAD') {
      if (body !== undefined && requestInit.body === undefined) {
        requestInit.body = JSON.stringify(body);
      }
    } else if (init?.body) {
      requestInit.body = init.body;
    } else {
      delete requestInit.body;
    }

    delete (requestInit as { searchParams?: unknown }).searchParams;

    const response = await this.fetchImpl(url, requestInit);
    const payload = await parsePayload(response);

    if (!response.ok) {
      const message = extractErrorMessage(payload) ?? `Request failed (${response.status})`;
      throw new SessionClientError(message, response.status, payload);
    }

    return payload as T;
  }

  private resolveUrl(path: string, searchParams?: Record<string, string | number | boolean | undefined>): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(normalizedPath, this.baseUrl);
    if (searchParams) {
      for (const [key, value] of Object.entries(searchParams)) {
        if (value === undefined) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }
}

function normaliseBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  return trimmed.endsWith('/api/auth') ? trimmed : `${trimmed}/api/auth`;
}

async function parsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  if ('error' in payload && payload.error) {
    const value = (payload as Record<string, unknown>).error;
    if (typeof value === 'string') {
      return value;
    }
    if (value && typeof value === 'object' && 'message' in value && typeof value.message === 'string') {
      return value.message;
    }
  }
  if ('message' in payload && typeof (payload as Record<string, unknown>).message === 'string') {
    return (payload as Record<string, unknown>).message as string;
  }
  return undefined;
}

function toAbsoluteReturnUrl(candidate: string): string {
  try {
    const url = new URL(candidate, typeof window !== 'undefined' ? window.location.origin : 'https://justevery.com');
    return url.toString();
  } catch {
    return candidate;
  }
}
