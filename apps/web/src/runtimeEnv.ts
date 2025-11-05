import * as React from 'react';

type InjectedEnvPayload = {
  logtoEndpoint?: string | null;
  logtoAppId?: string | null;
  apiResource?: string | null;
  logtoPostLogoutRedirectUri?: string | null;
  workerOrigin?: string | null;
};

type WindowWithEnv = Window & {
  __JUSTEVERY_ENV__?: InjectedEnvPayload;
};

export type ClientEnv = {
  logtoEndpoint?: string;
  logtoAppId?: string;
  apiResource?: string;
  postLogoutRedirectUri?: string;
  workerOrigin?: string;
  redirectUri?: string;
  scopes: string[];
  resources: string[];
};

const staticEnv = (() => {
  const source = typeof process !== 'undefined' && process.env ? process.env : {};

  const read = (key: string): string | undefined => {
    const value = source[key];
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  const readList = (key: string): string[] => {
    const raw = read(key);
    if (!raw) {
      return [];
    }
    return raw
      .split(/[\s,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  };

  return {
    logtoEndpoint: read('EXPO_PUBLIC_LOGTO_ENDPOINT'),
    logtoAppId: read('EXPO_PUBLIC_LOGTO_APP_ID'),
    apiResource: read('EXPO_PUBLIC_API_RESOURCE'),
    postLogoutRedirectUri: read('EXPO_PUBLIC_LOGTO_POST_LOGOUT_REDIRECT_URI'),
    workerOrigin: read('EXPO_PUBLIC_WORKER_ORIGIN'),
    redirectUri: read('EXPO_PUBLIC_LOGTO_REDIRECT_URI'),
    scopes: readList('EXPO_PUBLIC_LOGTO_SCOPES'),
    resources: readList('EXPO_PUBLIC_LOGTO_RESOURCES'),
  };
})();

const getInjectedEnv = (): InjectedEnvPayload | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const candidate = (window as WindowWithEnv).__JUSTEVERY_ENV__;
  if (!candidate) {
    return undefined;
  }
  return candidate;
};

const normalise = (value?: string | null): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const toClientEnv = (injected?: InjectedEnvPayload): ClientEnv => {
  const overrideEndpoint = normalise(injected?.logtoEndpoint);
  const overrideAppId = normalise(injected?.logtoAppId);
  const overrideResource = normalise(injected?.apiResource);
  const overrideLogout = normalise(injected?.logtoPostLogoutRedirectUri);
  const overrideWorker = normalise(injected?.workerOrigin);

  const resourceSet = new Set<string>();
  for (const entry of staticEnv.resources) {
    resourceSet.add(entry);
  }
  if (staticEnv.apiResource) {
    resourceSet.add(staticEnv.apiResource);
  }
  if (overrideResource) {
    resourceSet.add(overrideResource);
  }

  return {
    logtoEndpoint: overrideEndpoint ?? staticEnv.logtoEndpoint,
    logtoAppId: overrideAppId ?? staticEnv.logtoAppId,
    apiResource: overrideResource ?? staticEnv.apiResource,
    postLogoutRedirectUri: overrideLogout ?? staticEnv.postLogoutRedirectUri,
    workerOrigin: overrideWorker ?? staticEnv.workerOrigin,
    redirectUri: staticEnv.redirectUri,
    scopes: [...staticEnv.scopes],
    resources: Array.from(resourceSet),
  };
};

export const resolveClientEnv = (): ClientEnv => {
  return toClientEnv(getInjectedEnv());
};

export const usePublicEnv = (): ClientEnv => {
  const [env, setEnv] = React.useState<ClientEnv>(() => resolveClientEnv());

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const withEnv = window as WindowWithEnv;

    const updateFromPayload = (payload?: InjectedEnvPayload) => {
      setEnv(toClientEnv(payload ?? withEnv.__JUSTEVERY_ENV__));
    };

    const handler = (event: Event) => {
      updateFromPayload('detail' in event ? (event as CustomEvent<InjectedEnvPayload>).detail : undefined);
    };

    // In case the payload is already available before listener registration.
    updateFromPayload(withEnv.__JUSTEVERY_ENV__);

    window.addEventListener('justevery:env-ready', handler as EventListener);
    return () => window.removeEventListener('justevery:env-ready', handler as EventListener);
  }, []);

  return env;
};
