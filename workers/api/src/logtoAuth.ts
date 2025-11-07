import {
  discoveryPath,
  fetchOidcConfig,
  fetchTokenByAuthorizationCode,
  generateSignInUri,
  verifyAndParseCodeFromCallbackUri,
} from '@logto/js';
import type { Requester } from '@logto/js';
import type { Env } from './index';

const SIGN_IN_COOKIE = 'je_pkce';
const SESSION_COOKIE = 'je_session';
const SESSION_VERSION = 1;
const PKCE_SESSION_TTL_MS = 10 * 60 * 1000;
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_SCOPES = ['openid', 'offline_access', 'profile', 'email'];

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const hmacCache = new Map<string, CryptoKey>();
const oidcCache = new Map<string, Promise<LogtoOidcConfig>>();

const workerRequester: Requester = async <T>(input: RequestInfo | URL, init?: RequestInit) => {
  const response = await fetch(input, init);
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    const suffix = errorBody ? `: ${errorBody}` : '';
    throw new Error(`Logto request failed (${response.status} ${response.statusText})${suffix}`);
  }
  const parsed = await parseJsonResponse<T>(response);
  return parsed as T;
};

type LogtoOidcConfig = {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint?: string;
  revocationEndpoint?: string;
};

type SignInSessionPayload = {
  v: number;
  state: string;
  codeVerifier: string;
  redirectUri: string;
  returnTo: string;
  createdAt: number;
};

type SessionCookiePayload = {
  v: number;
  sid: string;
  accessToken: string;
  refreshToken?: string | null;
  idToken?: string | null;
  scope?: string[];
  expiresAt: number;
};

export async function handleAuthSignIn(request: Request, env: Env): Promise<Response> {
  const credentials = getLogtoCredentials(env);
  const url = new URL(request.url);
  const returnTo = url.searchParams.get('return') ?? '/app';
  const redirectUri = resolveRedirectUri(env, request);
  const state = generateRandomString(64);
  const codeVerifier = generateRandomString(96);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const oidc = await loadOidcConfig(env);

  const signInUri = generateSignInUri({
    authorizationEndpoint: oidc.authorizationEndpoint,
    clientId: credentials.appId,
    redirectUri,
    codeChallenge,
    state,
    scopes: DEFAULT_SCOPES,
    resources: env.LOGTO_API_RESOURCE ? [env.LOGTO_API_RESOURCE] : undefined,
  });

  const pkcePayload: SignInSessionPayload = {
    v: 1,
    state,
    codeVerifier,
    redirectUri,
    returnTo,
    createdAt: Date.now(),
  };

  const cookieValue = await encodeCookie(pkcePayload, env);
  const headers = new Headers({ Location: signInUri });
  headers.append(
    'Set-Cookie',
    serializeCookie(SIGN_IN_COOKIE, cookieValue, request, { maxAgeSeconds: Math.floor(PKCE_SESSION_TTL_MS / 1000) })
  );
  return new Response(null, { status: 302, headers });
}

export async function handleAuthCallback(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  const credentials = getLogtoCredentials(env);
  const signinCookie = getCookie(request, SIGN_IN_COOKIE);
  if (!signinCookie) {
    return new Response('Sign-in session expired. Please try again.', { status: 400 });
  }

  const pkcePayload = await decodeCookie<SignInSessionPayload>(signinCookie, env);
  if (!pkcePayload) {
    return new Response('Sign-in session invalid. Please try again.', { status: 400 });
  }
  if (Date.now() - pkcePayload.createdAt > PKCE_SESSION_TTL_MS) {
    return new Response('Sign-in session expired. Please try again.', { status: 400 });
  }

  const oidc = await loadOidcConfig(env);
  const code = verifyAndParseCodeFromCallbackUri(request.url, pkcePayload.redirectUri, pkcePayload.state);
  const tokens = await fetchTokenByAuthorizationCode(
    {
      clientId: credentials.appId,
      tokenEndpoint: oidc.tokenEndpoint,
      redirectUri: pkcePayload.redirectUri,
      codeVerifier: pkcePayload.codeVerifier,
      code,
    },
    createRequester(credentials)
  );

  const sessionPayload: SessionCookiePayload = {
    v: SESSION_VERSION,
    sid: crypto.randomUUID(),
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken ?? null,
    idToken: tokens.idToken ?? null,
    scope: tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : undefined,
    expiresAt: Date.now() + tokens.expiresIn * 1000,
  };

  const sessionCookie = await encodeCookie(sessionPayload, env);
  const headers = new Headers({ Location: resolveReturnTo(request, pkcePayload.returnTo) });
  headers.append(
    'Set-Cookie',
    serializeCookie(SESSION_COOKIE, sessionCookie, request, { maxAgeSeconds: SESSION_MAX_AGE_SECONDS })
  );
  headers.append('Set-Cookie', serializeCookie(SIGN_IN_COOKIE, '', request, { maxAgeSeconds: 0 }));
  return new Response(null, { status: 302, headers });
}

export async function handleAuthSignOut(request: Request, env: Env): Promise<Response> {
  const credentials = getLogtoCredentials(env, true);
  const session = await decodeSessionCookie(request, env);
  if (session?.payload?.refreshToken && credentials) {
    try {
      const oidc = await loadOidcConfig(env);
      if (oidc.revocationEndpoint) {
        await fetch(oidc.revocationEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: buildBasicAuth(credentials.appId, credentials.appSecret),
          },
          body: new URLSearchParams({ token: session.payload.refreshToken ?? '' }),
        });
      }
    } catch {
      // ignore sign-out failures
    }
  }

  const headers = new Headers();
  headers.append('Set-Cookie', serializeCookie(SESSION_COOKIE, '', request, { maxAgeSeconds: 0 }));
  const url = new URL(request.url);
  const returnTo = url.searchParams.get('return');

  if (request.method === 'GET') {
    headers.set('Location', resolveReturnTo(request, returnTo ?? '/'));
    return new Response(null, { status: 302, headers });
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers });
  }

  return jsonAuthResponse(request, { ok: true }, 200, headers);
}

export async function handleAuthToken(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return authPreflightResponse(request);
  }
  if (request.method !== 'GET') {
    return jsonAuthResponse(request, { error: 'method_not_allowed' }, 405);
  }

  const session = await decodeSessionCookie(request, env);
  if (!session.payload) {
    const headers = new Headers();
    if (session.cookieHeader) {
      headers.append('Set-Cookie', session.cookieHeader);
    }
    return jsonAuthResponse(request, { error: 'not_authenticated' }, 401, headers);
  }

  if (session.payload.expiresAt <= Date.now()) {
    const headers = new Headers();
    headers.append('Set-Cookie', serializeCookie(SESSION_COOKIE, '', request, { maxAgeSeconds: 0 }));
    return jsonAuthResponse(request, { error: 'session_expired' }, 401, headers);
  }

  const headers = new Headers();
  if (session.cookieHeader) {
    headers.append('Set-Cookie', session.cookieHeader);
  }
  return jsonAuthResponse(
    request,
    { token: session.payload.accessToken, expiresAt: session.payload.expiresAt },
    200,
    headers
  );
}

export async function handleAuthIdToken(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return authPreflightResponse(request);
  }
  if (request.method !== 'GET') {
    return jsonAuthResponse(request, { error: 'method_not_allowed' }, 405);
  }

  const session = await decodeSessionCookie(request, env);
  if (!session.payload || !session.payload.idToken) {
    const headers = new Headers();
    if (session.cookieHeader) {
      headers.append('Set-Cookie', session.cookieHeader);
    }
    return jsonAuthResponse(request, { error: 'not_authenticated' }, 401, headers);
  }

  const body = decodeJwtPayload(session.payload.idToken);
  const headers = new Headers();
  if (session.cookieHeader) {
    headers.append('Set-Cookie', session.cookieHeader);
  }
  return jsonAuthResponse(request, body, 200, headers);
}

export async function handleAuthUserInfo(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return authPreflightResponse(request);
  }
  if (request.method !== 'GET') {
    return jsonAuthResponse(request, { error: 'method_not_allowed' }, 405);
  }

  const session = await decodeSessionCookie(request, env);
  if (!session.payload) {
    const headers = new Headers();
    if (session.cookieHeader) {
      headers.append('Set-Cookie', session.cookieHeader);
    }
    return jsonAuthResponse(request, { error: 'not_authenticated' }, 401, headers);
  }

  const oidc = await loadOidcConfig(env);
  if (!oidc.userinfoEndpoint) {
    return jsonAuthResponse(request, { error: 'unsupported' }, 400);
  }

  const response = await fetch(oidc.userinfoEndpoint, {
    headers: {
      Authorization: `Bearer ${session.payload.accessToken}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      const headers = new Headers();
      headers.append('Set-Cookie', serializeCookie(SESSION_COOKIE, '', request, { maxAgeSeconds: 0 }));
      return jsonAuthResponse(request, { error: 'session_expired' }, 401, headers);
    }
    return jsonAuthResponse(request, { error: 'userinfo_failed' }, 502);
  }

  const headers = new Headers();
  if (session.cookieHeader) {
    headers.append('Set-Cookie', session.cookieHeader);
  }
  return jsonAuthResponse(request, await response.json(), 200, headers);
}

function getLogtoCredentials(env: Env, allowPartial = false) {
  const endpoint = env.LOGTO_ENDPOINT;
  const appId = env.LOGTO_APPLICATION_ID;
  const appSecret = env.LOGTO_APPLICATION_SECRET;
  if (!endpoint || !appId || !appSecret) {
    if (allowPartial) {
      return null;
    }
    throw new Error('Logto Traditional application is not fully configured.');
  }
  return { endpoint, appId, appSecret };
}

function resolveRedirectUri(env: Env, request: Request): string {
  if (env.EXPO_PUBLIC_LOGTO_REDIRECT_URI) {
    return env.EXPO_PUBLIC_LOGTO_REDIRECT_URI;
  }
  if (env.EXPO_PUBLIC_LOGTO_REDIRECT_URI_PROD && isHttpsRequest(request)) {
    return env.EXPO_PUBLIC_LOGTO_REDIRECT_URI_PROD;
  }
  if (env.EXPO_PUBLIC_LOGTO_REDIRECT_URI_LOCAL && !isHttpsRequest(request)) {
    return env.EXPO_PUBLIC_LOGTO_REDIRECT_URI_LOCAL;
  }
  const origin = new URL(request.url).origin;
  return `${origin}/callback`;
}

function resolveReturnTo(request: Request, target?: string): string {
  if (!target) {
    return '/app';
  }
  try {
    const url = new URL(target);
    return url.toString();
  } catch {
    const base = new URL(request.url);
    if (target.startsWith('/')) {
      return `${base.origin}${target}`;
    }
    return `${base.origin}/${target}`;
  }
}

function generateRandomString(length = 64): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes).slice(0, length);
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return toBase64Url(digest);
}

async function encodeCookie<T>(payload: T, env: Env): Promise<string> {
  if (!env.LOGTO_APPLICATION_SECRET) {
    throw new Error('LOGTO_APPLICATION_SECRET missing');
  }
  const data = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await signData(env.LOGTO_APPLICATION_SECRET, data);
  return `${data}.${signature}`;
}

async function decodeCookie<T>(value: string, env: Env): Promise<T | null> {
  if (!env.LOGTO_APPLICATION_SECRET) {
    return null;
  }
  const [data, signature] = value.split('.', 2);
  if (!data || !signature) {
    return null;
  }
  const valid = await verifySignature(env.LOGTO_APPLICATION_SECRET, data, signature);
  if (!valid) {
    return null;
  }
  try {
    return JSON.parse(decoder.decode(fromBase64Url(data))) as T;
  } catch {
    return null;
  }
}

async function decodeSessionCookie(
  request: Request,
  env: Env
): Promise<{ payload: SessionCookiePayload | null; cookieHeader?: string }> {
  const raw = getCookie(request, SESSION_COOKIE);
  if (!raw) {
    return { payload: null };
  }
  const payload = await decodeCookie<SessionCookiePayload>(raw, env);
  if (!payload || payload.v !== SESSION_VERSION) {
    return {
      payload: null,
      cookieHeader: serializeCookie(SESSION_COOKIE, '', request, { maxAgeSeconds: 0 }),
    };
  }
  return { payload };
}

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  const cookies = header.split(';');
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.trim().split('=');
    if (key === name) {
      return rest.join('=').trim();
    }
  }
  return null;
}

function serializeCookie(
  name: string,
  value: string,
  request: Request,
  options: { maxAgeSeconds?: number }
): string {
  const parts = [`${name}=${value}`];
  parts.push('Path=/');
  if (options.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${options.maxAgeSeconds}`);
    if (options.maxAgeSeconds === 0) {
      parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    } else {
      parts.push(`Expires=${new Date(Date.now() + options.maxAgeSeconds * 1000).toUTCString()}`);
    }
  }
  parts.push('HttpOnly');
  if (isHttpsRequest(request)) {
    parts.push('Secure');
  }
  parts.push('SameSite=Lax');
  return parts.join('; ');
}

function isHttpsRequest(request: Request): boolean {
  return new URL(request.url).protocol === 'https:';
}

async function signData(secret: string, value: string): Promise<string> {
  let key = hmacCache.get(secret);
  if (!key) {
    key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    hmacCache.set(secret, key);
  }
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return toBase64Url(signature);
}

async function verifySignature(secret: string, value: string, signature: string): Promise<boolean> {
  let key = hmacCache.get(secret);
  if (!key) {
    key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    hmacCache.set(secret, key);
  }
  try {
    const expected = fromBase64Url(signature);
    return crypto.subtle.verify('HMAC', key, expected, encoder.encode(value));
  } catch {
    return false;
  }
}

function toBase64Url(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  let padded = value.replace(/-/g, '+').replace(/_/g, '/');
  while (padded.length % 4 !== 0) {
    padded += '=';
  }
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function loadOidcConfig(env: Env): Promise<LogtoOidcConfig> {
  if (!env.LOGTO_ENDPOINT) {
    throw new Error('LOGTO_ENDPOINT missing');
  }
  const cached = oidcCache.get(env.LOGTO_ENDPOINT);
  if (cached) {
    return cached;
  }
  const promise = fetchOidcConfig(new URL(discoveryPath, env.LOGTO_ENDPOINT).toString(), workerRequester).then((config) => ({
    authorizationEndpoint: config.authorizationEndpoint,
    tokenEndpoint: config.tokenEndpoint,
    userinfoEndpoint: config.userinfoEndpoint,
    revocationEndpoint: config.revocationEndpoint,
  }));
  oidcCache.set(env.LOGTO_ENDPOINT, promise);
  return promise;
}

function createRequester(credentials: { appId: string; appSecret: string }): Requester {
  const header = buildBasicAuth(credentials.appId, credentials.appSecret);
  return <T>(input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', header);
    return workerRequester<T>(input, { ...init, headers });
  };
}

async function parseJsonResponse<T>(response: Response): Promise<T | undefined> {
  if (response.status === 204) {
    return undefined;
  }
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }
  const contentLength = response.headers.get('content-length');
  if (contentLength === '0') {
    return undefined;
  }
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

function buildBasicAuth(appId: string, appSecret: string): string {
  return `Basic ${btoa(`${appId}:${appSecret}`)}`;
}

function decodeJwtPayload(token: string): unknown {
  const [, payload] = token.split('.', 3);
  if (!payload) {
    return {};
  }
  try {
    return JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
  } catch {
    return {};
  }
}

function jsonAuthResponse(
  request: Request,
  body: unknown,
  status = 200,
  extraHeaders?: Headers
): Response {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=UTF-8' });
  const origin = request.headers.get('Origin');
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.append('Vary', 'Origin');
  } else {
    headers.set('Access-Control-Allow-Origin', new URL(request.url).origin);
  }
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-session-token');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (extraHeaders) {
    extraHeaders.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') {
        headers.append('Set-Cookie', value);
      } else {
        headers.set(key, value);
      }
    });
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function authPreflightResponse(request: Request): Response {
  const origin = request.headers.get('Origin') ?? new URL(request.url).origin;
  const headers = new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-session-token',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  headers.append('Vary', 'Origin');
  return new Response(null, { status: 204, headers });
}

export { jsonAuthResponse, authPreflightResponse, decodeSessionCookie };
