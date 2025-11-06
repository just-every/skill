/**
 * Example usage for web (Expo/React Native Web)
 * apps/web/src/runtimeEnv.ts
 */

import { createWebEnvGetter, getInjectedEnv, mergeEnv, normalizeValue, parseList } from '@justevery/config/web';

// Define your web env schema
type ClientEnv = {
  logtoEndpoint?: string;
  logtoAppId?: string;
  apiResource?: string;
  postLogoutRedirectUri?: string;
  workerOrigin?: string;
  redirectUri?: string;
  scopes: string[];
  resources: string[];
};

// Step 1: Read static env (EXPO_PUBLIC_ prefixed)
const getEnv = createWebEnvGetter('EXPO_PUBLIC_');

const staticEnv: ClientEnv = {
  logtoEndpoint: getEnv('LOGTO_ENDPOINT'),
  logtoAppId: getEnv('LOGTO_APP_ID'),
  apiResource: getEnv('API_RESOURCE'),
  postLogoutRedirectUri: getEnv('LOGTO_POST_LOGOUT_REDIRECT_URI'),
  workerOrigin: getEnv('WORKER_ORIGIN'),
  redirectUri: getEnv('LOGTO_REDIRECT_URI'),
  scopes: parseList(getEnv('LOGTO_SCOPES')),
  resources: parseList(getEnv('LOGTO_RESOURCES')),
};

// Step 2: Check for injected env from window
const injected = getInjectedEnv<Partial<ClientEnv>>();

// Step 3: Merge sources
export const resolveClientEnv = (): ClientEnv => {
  return mergeEnv(staticEnv, injected);
};

// Step 4: React hook for reactive env (optional)
import * as React from 'react';

export function usePublicEnv(): ClientEnv {
  const [env, setEnv] = React.useState<ClientEnv>(() => resolveClientEnv());

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = (event: Event) => {
      const detail = 'detail' in event ? (event as CustomEvent).detail : undefined;
      setEnv(mergeEnv(staticEnv, detail ?? getInjectedEnv()));
    };

    window.addEventListener('justevery:env-ready', handler as EventListener);
    return () => window.removeEventListener('justevery:env-ready', handler as EventListener);
  }, []);

  return env;
}
