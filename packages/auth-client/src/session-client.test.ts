import { describe, expect, it, vi } from 'vitest';

import { SessionClient } from './session-client';

const OK_RESPONSE = new Response(JSON.stringify({ ok: true }), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});

describe('SessionClient', () => {
  it('targets the Better Auth API scope when requesting internal paths', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(OK_RESPONSE.clone());
    const client = new SessionClient({ baseUrl: 'https://login.justevery.com/api/auth', fetch: fetchSpy });

    await client.getSession();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://login.justevery.com/api/auth/session',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('preserves query params across relative requests', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(OK_RESPONSE.clone());
    const client = new SessionClient({ baseUrl: 'https://login.justevery.com/api/auth', fetch: fetchSpy });

    await client.beginPasskeyRegistration({ step: 'one' });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://login.justevery.com/api/auth/passkey/generate-register-options?step=one',
      expect.any(Object)
    );
  });
});
