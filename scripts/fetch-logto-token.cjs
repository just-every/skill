#!/usr/bin/env node

const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

function abort(message, details) {
  console.error(message);
  if (details) {
    console.error(details);
  }
  process.exit(1);
}

function resolveTokenEndpoint(rawEndpoint) {
  const trimmed = (rawEndpoint || '').trim();
  if (!trimmed) return null;
  const normalised = trimmed.replace(/\/+$/, '');
  if (/\/oidc\/token$/i.test(normalised)) {
    return normalised;
  }
  if (/\/oidc$/i.test(normalised)) {
    return `${normalised}/token`;
  }
  return `${normalised}/oidc/token`;
}

function decodeClaims(token) {
  if (typeof token !== 'string') return null;
  const segments = token.split('.');
  if (segments.length < 2) return null;
  const payload = segments[1].replace(/-/g, '+').replace(/_/g, '/');
  const padding = payload.length % 4 === 0 ? '' : '='.repeat(4 - (payload.length % 4));
  try {
    const json = Buffer.from(payload + padding, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const endpoint = process.env.LOGTO_ENDPOINT;
const tokenEndpoint = resolveTokenEndpoint(endpoint);

if (!tokenEndpoint) {
  abort('LOGTO_ENDPOINT is required to mint a Logto token.');
}

const basicAuth = process.env.LOGTO_MANAGEMENT_AUTH_BASIC;
const clientId = process.env.LOGTO_CLIENT_ID ?? process.env.LOGTO_M2M_CLIENT_ID;
const clientSecret = process.env.LOGTO_CLIENT_SECRET ?? process.env.LOGTO_M2M_CLIENT_SECRET;
const resource = process.env.LOGTO_API_RESOURCE;
const tokenScope = process.env.LOGTO_TOKEN_SCOPE ?? process.env.LOGTO_SCOPE;

if (!basicAuth && (!clientId || !clientSecret)) {
  const missing = [];
  if (!clientId) missing.push('LOGTO_CLIENT_ID');
  if (!clientSecret) missing.push('LOGTO_CLIENT_SECRET');
  abort(
    'Provide LOGTO_MANAGEMENT_AUTH_BASIC or both LOGTO_CLIENT_ID and LOGTO_CLIENT_SECRET.',
    missing.length ? `Missing: ${missing.join(', ')}` : undefined,
  );
}

const body = new URLSearchParams({ grant_type: 'client_credentials' });
if (resource) {
  body.set('resource', resource);
}
if (!basicAuth) {
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);
}

if (tokenScope) {
  body.set('scope', tokenScope);
}

const headers = { 'content-type': 'application/x-www-form-urlencoded' };
if (basicAuth) {
  headers.authorization = `Basic ${basicAuth}`;
}

(async () => {
  let response;
  try {
    response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers,
      body,
    });
  } catch (error) {
    abort('Failed to reach Logto token endpoint.', error.message);
  }

  if (!response.ok) {
    let detail;
    try {
      detail = await response.text();
    } catch (error) {
      detail = error.message;
    }
    abort(`Logto token request failed (${response.status} ${response.statusText}).`, detail);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    abort('Logto token response was not valid JSON.', error.message);
  }

  const token = payload.access_token;
  if (!token) {
    abort('Logto token response did not include access_token.');
  }

  const claims = decodeClaims(token);
  const meta = {
    fetchedAt: new Date().toISOString(),
    endpoint: tokenEndpoint,
    resource: resource || null,
    authMethod: basicAuth ? 'client_credentials_basic' : 'client_credentials_post',
    tokenType: payload.token_type || null,
    expiresIn: payload.expires_in ?? null,
    scope: payload.scope || null,
    clientId: basicAuth ? null : clientId || null,
    claims,
  };

  const resultsDir = resolve(process.cwd(), 'test-results');
  const metaPath = resolve(resultsDir, 'logto-token.meta.json');

  try {
    mkdirSync(resultsDir, { recursive: true });
    writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  } catch (error) {
    abort(`Failed to write metadata file at ${metaPath}.`, error.message);
  }

  process.stdout.write(`${token}\n`);
})().catch((error) => {
  abort('Unexpected error while fetching Logto access token.', error.message);
});
