import * as React from 'react';

type InjectedEnvPayload = {
  logtoEndpoint?: string | null;
  logtoAppId?: string | null;
  apiResource?: string | null;
  logtoPostLogoutRedirectUri?: string | null;
  workerOrigin?: string | null;
  logtoRedirectUri?: string | null;
  logtoRedirectUriLocal?: string | null;
  logtoRedirectUriProd?: string | null;
  workerOriginLocal?: string | null;
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
  workerOriginLocal?: string;
  redirectUri?: string;
  redirectUriLocal?: string;
  redirectUriProd?: string;
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
    workerOriginLocal: read('EXPO_PUBLIC_WORKER_ORIGIN_LOCAL'),
    redirectUri: read('EXPO_PUBLIC_LOGTO_REDIRECT_URI'),
    redirectUriLocal: read('EXPO_PUBLIC_LOGTO_REDIRECT_URI_LOCAL'),
    redirectUriProd: read('EXPO_PUBLIC_LOGTO_REDIRECT_URI_PROD'),
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
  const overrideWorkerLocal = normalise(injected?.workerOriginLocal);
  const overrideRedirect = normalise(injected?.logtoRedirectUri);
  const overrideRedirectLocal = normalise(injected?.logtoRedirectUriLocal);
  const overrideRedirectProd = normalise(injected?.logtoRedirectUriProd);

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

  const chooseRedirect = () => {
    const configured = overrideRedirect ?? staticEnv.redirectUri;
    const configuredLocal = overrideRedirectLocal ?? staticEnv.redirectUriLocal;
    const configuredProd = overrideRedirectProd ?? staticEnv.redirectUriProd;

    const normaliseHttpUrl = (candidate?: string) => {
      if (!candidate) {
        return undefined;
      }
      try {
        const parsed = new URL(candidate);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          return parsed.toString();
        }
      } catch {
        // ignore invalid URLs (likely native schemes)
      }
      return undefined;
    };

    if (typeof window !== 'undefined') {
      const { origin, hostname } = window.location;
      const originCallback = `${origin}/callback`;
      const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';

      const prefersOrigin = (candidate?: string) => {
        if (!candidate) {
          return undefined;
        }
        try {
          const parsed = new URL(candidate);
          if (parsed.origin === origin) {
            return parsed.toString();
          }
        } catch {
          // ignore
        }
        return undefined;
      };

      if (isLocalHost) {
        return (
          prefersOrigin(configuredLocal) ??
          prefersOrigin(configured) ??
          normaliseHttpUrl(configuredLocal) ??
          normaliseHttpUrl(configured) ??
          configuredLocal ??
          configured ??
          originCallback
        );
      }

      const prodCandidate = normaliseHttpUrl(configuredProd) ?? normaliseHttpUrl(configured);
      if (prodCandidate) {
        return prodCandidate;
      }

      return configuredProd ?? originCallback;
    }

    return configuredProd ?? configured ?? configuredLocal;
  };

  const workerOrigin = (() => {
    const configured = overrideWorker ?? staticEnv.workerOrigin;
    const configuredLocal = overrideWorkerLocal ?? staticEnv.workerOriginLocal;

    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') {
        if (configuredLocal && configuredLocal.startsWith(window.location.origin)) {
          return configuredLocal;
        }
        return window.location.origin;
      }
    }

    if (configured) {
      return configured;
    }
    if (configuredLocal) {
      return configuredLocal;
    }
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return undefined;
  })();

  const redirectUri = chooseRedirect();

  return {
    logtoEndpoint: overrideEndpoint ?? staticEnv.logtoEndpoint,
    logtoAppId: overrideAppId ?? staticEnv.logtoAppId,
    apiResource: overrideResource ?? staticEnv.apiResource,
    postLogoutRedirectUri: overrideLogout ?? staticEnv.postLogoutRedirectUri,
    workerOrigin,
    workerOriginLocal: overrideWorkerLocal ?? staticEnv.workerOriginLocal,
    redirectUri,
    redirectUriLocal: overrideRedirectLocal ?? staticEnv.redirectUriLocal,
    redirectUriProd: overrideRedirectProd ?? staticEnv.redirectUriProd,
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

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (env.logtoEndpoint && env.logtoAppId) {
      return;
    }

    let cancelled = false;

    const loadRuntimeEnv = async () => {
      try {
        const response = await fetch('/api/runtime-env', {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as InjectedEnvPayload;
        if (!cancelled) {
          setEnv(toClientEnv(payload));
        }
      } catch (runtimeError) {
        console.warn('Failed to load runtime env', runtimeError);
      }
    };

    void loadRuntimeEnv();

    return () => {
      cancelled = true;
    };
  }, [env.logtoAppId, env.logtoEndpoint]);

  return env;
};
