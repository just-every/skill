import { type PropsWithChildren, useEffect, useMemo, useState } from 'react';

import { StytchB2BProvider } from '@stytch/react/dist/b2b/index.js';
import { StytchB2BUIClient } from '@stytch/vanilla-js/b2b';

function readEnv(key: string): string | undefined {
  const globalEnv = globalThis as {
    __JUSTEVERY_ENV__?: Record<string, string | undefined>;
    process?: { env?: Record<string, string | undefined> };
  };

  const value =
    globalEnv.__JUSTEVERY_ENV__?.[key] ?? globalEnv.process?.env?.[key];

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export default function StytchProvider({ children }: PropsWithChildren): JSX.Element {
  const token = useMemo(() => readEnv('EXPO_PUBLIC_STYTCH_PUBLIC_TOKEN'), []);
  const baseUrl = useMemo(() => readEnv('EXPO_PUBLIC_STYTCH_BASE_URL'), []);

  const shouldInit = typeof window !== 'undefined' && !!token;
  const [client, setClient] = useState<StytchB2BUIClient | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldInit) {
      setClient(null);
      setError(null);
      return;
    }

    let cancelled = false;
    try {
      const instance = new StytchB2BUIClient(token!);
      if (baseUrl && typeof instance.setBaseUrl === 'function') {
        instance.setBaseUrl(baseUrl);
      }
      if (!cancelled) {
        setClient(instance);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to initialize Stytch B2B client', err);
      if (!cancelled) {
        setClient(null);
        setError('Unable to connect to Stytch right now.');
      }
    }

    return () => {
      cancelled = true;
    };
  }, [baseUrl, shouldInit, token]);

  if (!shouldInit || !client) {
    if (error) {
      return (
        <div style={{ color: '#f87171', padding: '1rem', textAlign: 'center' }}>
          {error}
        </div>
      );
    }
    return <>{children}</>;
  }

  return <StytchB2BProvider stytch={client}>{children}</StytchB2BProvider>;
}
