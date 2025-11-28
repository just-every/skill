import http from 'node:http';
import https from 'node:https';

const LOGIN_ORIGIN = 'https://login.justevery.com';
// Default to the real login port so the proxy can fully stand in for the worker during local dev.
const PORT = Number(process.env.PORT || 9787);

const now = () => new Date();
const iso = (d) => d.toISOString();

const buildSession = (token) => {
  const createdAt = now();
  const updatedAt = now();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 8); // 8h
  return {
    session: {
      id: 'sess_dev_123',
      userId: 'user_dev_123',
      token,
      createdAt: iso(createdAt),
      updatedAt: iso(updatedAt),
      expiresAt: iso(expiresAt),
      ipAddress: '127.0.0.1',
      userAgent: 'dev-proxy',
    },
    user: {
      id: 'user_dev_123',
      email: 'dev@example.com',
      emailVerified: true,
      name: 'Dev Example',
      createdAt: iso(createdAt),
      updatedAt: iso(updatedAt),
    },
  };
};

const companiesPayload = {
  accounts: [
    {
      id: 'org_dev_1',
      slug: 'dev-co',
      name: 'Dev Co',
      plan: 'Founders',
    },
  ],
  currentAccountId: 'org_dev_1',
};

const membersPayload = {
  members: [
    { id: 'mem_1', name: 'Dev Example', email: 'dev@example.com', role: 'owner' },
  ],
};

const assetsPayload = [];
const usagePayload = { points: [] };
const subscriptionPayload = { subscription: { status: 'active', planName: 'Founders' } };

const jsonHeaders = (origin, setCookie) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Credentials': 'true',
  };
  if (setCookie) {
    headers['Set-Cookie'] = setCookie;
  }
  return headers;
};

const sendJson = (res, status, payload, origin, setCookie) => {
  res.writeHead(status, jsonHeaders(origin, setCookie));
  res.end(JSON.stringify(payload));
};

const handlePreflight = (req, res, origin) => {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || 'content-type',
    'Access-Control-Max-Age': '600',
  });
  res.end();
};

const proxyToLogin = (req, res) => {
  const upstreamUrl = new URL(req.url, LOGIN_ORIGIN);
  const proxyReq = https.request(
    upstreamUrl,
    {
      method: req.method,
      headers: {
        ...req.headers,
        host: upstreamUrl.host,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (error) => {
    console.error('[proxy] error', upstreamUrl.toString(), error);
    res.writeHead(502, jsonHeaders(req.headers.origin));
    res.end(JSON.stringify({ error: 'Upstream proxy failed' }));
  });

  req.pipe(proxyReq);
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const origin = req.headers.origin;

  if (req.method === 'OPTIONS') {
    handlePreflight(req, res, origin);
    return;
  }

  if (url.pathname === '/profile-popup.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*' });
    res.end('console.log("Profile popup placeholder loaded"); window.JustEveryProfile = { init: () => {} };');
    return;
  }

  if (url.pathname.startsWith('/profile')) {
    proxyToLogin(req, res);
    return;
  }

  if (url.pathname === '/api/auth/session') {
    const token =
      (req.headers.cookie || '').match(/better-auth\.session_token=([^;]+)/)?.[1] ||
      'dev-token';
    const setCookie = `better-auth.session_token=${encodeURIComponent(token)}; Path=/api; HttpOnly; SameSite=Lax`;
    sendJson(res, 200, buildSession(token), origin, setCookie);
    return;
  }

  if (url.pathname === '/api/auth/sign-out') {
    sendJson(res, 200, { ok: true }, origin);
    return;
  }

  if (url.pathname === '/api/accounts') {
    sendJson(res, 200, companiesPayload, origin);
    return;
  }

  if (url.pathname.endsWith('/members')) {
    sendJson(res, 200, membersPayload, origin);
    return;
  }

  if (url.pathname.endsWith('/assets')) {
    sendJson(res, 200, assetsPayload, origin);
    return;
  }

  if (url.pathname.endsWith('/usage')) {
    sendJson(res, 200, usagePayload, origin);
    return;
  }

  if (url.pathname.endsWith('/subscription')) {
    sendJson(res, 200, subscriptionPayload, origin);
    return;
  }

  if (url.pathname === '/api/session/bootstrap') {
    sendJson(res, 200, { ok: true }, origin);
    return;
  }

  sendJson(res, 404, { error: 'Not found', path: url.pathname }, origin);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[dev-login-proxy] http://127.0.0.1:${PORT}`);
  console.log('  • proxying /profile-popup.js and /profile/* to https://login.justevery.com');
});
