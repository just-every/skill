import type { BootstrapEnv } from '../env.js';

const BILLING_SCOPE = 'billing.checkout';
const MANAGE_SCOPE = 'service_clients.manage';
const DEFAULT_TIMEOUT_MS = 15000;

function requireEnv(value: string | undefined, key: string): string {
  if (!value || value.trim() === '') {
    throw new Error(`${key} is required for automated login provisioning`);
  }
  return value.trim();
}

function buildUrl(origin: string, path: string): string {
  const trimmed = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  return `${trimmed}${path.startsWith('/') ? '' : '/'}${path}`;
}

async function postJson(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function issueToken(
  loginOrigin: string,
  clientId: string,
  clientSecret: string,
  scope: string
): Promise<string> {
  const url = buildUrl(loginOrigin, '/api/auth/m2m/token');
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await postJson(url, {
    method: 'POST',
    headers: {
      authorization: `Basic ${basic}`,
    },
    body: JSON.stringify({ scope }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to issue token (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { access_token?: string; token?: string };
  const token = data.access_token ?? data.token;
  if (!token) {
    throw new Error('Token response missing access_token');
  }
  return token;
}

export interface BootstrapServiceClientResult {
  clientId: string;
  clientSecret: string;
  scopes: string[];
}

export async function ensureProjectServiceClient(env: BootstrapEnv): Promise<BootstrapServiceClientResult> {
  const loginOrigin = requireEnv(env.LOGIN_ORIGIN, 'LOGIN_ORIGIN');
  const provisionerClientId = requireEnv(env.LOGIN_PROVISIONER_CLIENT_ID, 'LOGIN_PROVISIONER_CLIENT_ID');
  const provisionerClientSecret = requireEnv(env.LOGIN_PROVISIONER_CLIENT_SECRET, 'LOGIN_PROVISIONER_CLIENT_SECRET');
  const ownerUserId = requireEnv(env.LOGIN_PROVISIONER_OWNER_USER_ID, 'LOGIN_PROVISIONER_OWNER_USER_ID');

  const provisionerToken = await issueToken(loginOrigin, provisionerClientId, provisionerClientSecret, MANAGE_SCOPE);

  const url = buildUrl(loginOrigin, '/api/internal/service-clients/bootstrap');
  const res = await postJson(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${provisionerToken}` },
    body: JSON.stringify({
      ownerUserId,
      projectId: env.PROJECT_ID,
      name: `project:${env.PROJECT_ID}:billing`,
      scopes: [BILLING_SCOPE],
      allowImpersonation: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to bootstrap service client (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    clientId?: string;
    clientSecret?: string;
    scopes?: string[];
  };

  if (!data.clientId || !data.clientSecret) {
    throw new Error('Bootstrap response missing client credentials');
  }

  return {
    clientId: data.clientId,
    clientSecret: data.clientSecret,
    scopes: data.scopes ?? [BILLING_SCOPE],
  };
}
