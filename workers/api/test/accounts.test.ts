import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockEnv, mockRequireSession, runFetch, setViewerEmail, setupTestWorker } from './helpers';

const realFetch = globalThis.fetch;

describe('Account selection & switching', () => {
  let worker: Awaited<ReturnType<typeof setupTestWorker>>['worker'];

  beforeEach(async () => {
    ({ worker } = await setupTestWorker());
    setViewerEmail('ava@justevery.com');
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    mockRequireSession.mockReset();
  });

  it('sets the active account cookie when switching companies', async () => {
    const env = createMockEnv();
    const request = new Request('http://127.0.0.1/api/accounts/justevery/switch', {
      method: 'POST',
    });

    const response = await runFetch(worker, request, env);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({ ok: true, currentAccountSlug: 'justevery' });
    expect(response.headers.get('Set-Cookie')).toContain('je.active_account=justevery');
  });

  it('returns the preferred account when the cookie matches a slug', async () => {
    const env = createMockEnv();
    const request = new Request('http://127.0.0.1/api/accounts', {
      headers: { cookie: 'je.active_account=aerion-labs' },
    });

    const response = await runFetch(worker, request, env);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.currentAccountId).toBe('acct-aerion-labs');
  });

  it('clears an invalid active account cookie', async () => {
    const env = createMockEnv();
    const request = new Request('http://127.0.0.1/api/accounts', {
      headers: { cookie: 'je.active_account=invalid-slug' },
    });

    const response = await runFetch(worker, request, env);
    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toContain('je.active_account=');
  });

  it('sets default active account cookie when none is provided', async () => {
    const env = createMockEnv();
    const request = new Request('http://127.0.0.1/api/accounts');

    const response = await runFetch(worker, request, env);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.currentAccountId).toBeTruthy();
    const setCookie = response.headers.get('Set-Cookie');
    expect(setCookie).toContain('je.active_account=justevery');
  });
});
