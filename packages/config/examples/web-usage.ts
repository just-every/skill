/**
 * Example usage for web (Expo/React Native Web)
 * Demonstrates reading Better Auth env vars from EXPO_PUBLIC_ sources.
 */

import { createWebEnvGetter, getInjectedEnv, mergeEnv } from '@justevery/config/web';
import * as React from 'react';

type ClientEnv = {
  loginOrigin?: string;
  betterAuthBaseUrl?: string;
  sessionEndpoint?: string;
  workerOrigin?: string;
};

const getEnv = createWebEnvGetter('EXPO_PUBLIC_');

const staticEnv: ClientEnv = {
  loginOrigin: getEnv('LOGIN_ORIGIN'),
  betterAuthBaseUrl: getEnv('BETTER_AUTH_URL'),
  sessionEndpoint: getEnv('SESSION_ENDPOINT'),
  workerOrigin: getEnv('WORKER_ORIGIN'),
};

const injected = getInjectedEnv<Partial<ClientEnv>>();

export const resolveClientEnv = (): ClientEnv => {
  return mergeEnv(staticEnv, injected);
};

export function usePublicEnv(): ClientEnv {
  const [env, setEnv] = React.useState<ClientEnv>(() => resolveClientEnv());

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = (event: Event) => {
      const detail = 'detail' in event ? (event as CustomEvent<Partial<ClientEnv>>).detail : undefined;
      setEnv(mergeEnv(staticEnv, detail ?? getInjectedEnv()));
    };

    window.addEventListener('justevery:env-ready', handler as EventListener);
    return () => window.removeEventListener('justevery:env-ready', handler as EventListener);
  }, []);

  return env;
}
