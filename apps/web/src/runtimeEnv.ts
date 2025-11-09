import * as React from 'react';
import {
  DEFAULT_LOGIN_ORIGIN,
  ensureBetterAuthBaseUrl,
  ensureSessionEndpoint,
} from '@justevery/config/auth';

type InjectedEnvPayload = {
  loginOrigin?: string | null;
  betterAuthBaseUrl?: string | null;
  sessionEndpoint?: string | null;
  workerOrigin?: string | null;
  workerOriginLocal?: string | null;
};

type WindowWithEnv = Window & {
  __JUSTEVERY_ENV__?: InjectedEnvPayload;
};

export type ClientEnv = {
  loginOrigin: string;
  betterAuthBaseUrl: string;
  sessionEndpoint: string;
  workerOrigin?: string;
  workerOriginLocal?: string;
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

  return {
    loginOrigin: read('EXPO_PUBLIC_LOGIN_ORIGIN') ?? read('LOGIN_ORIGIN'),
    betterAuthBaseUrl: read('EXPO_PUBLIC_BETTER_AUTH_URL') ?? read('BETTER_AUTH_URL'),
    sessionEndpoint: read('EXPO_PUBLIC_SESSION_ENDPOINT') ?? read('SESSION_ENDPOINT'),
    workerOrigin: read('EXPO_PUBLIC_WORKER_ORIGIN'),
    workerOriginLocal: read('EXPO_PUBLIC_WORKER_ORIGIN_LOCAL'),
  } satisfies InjectedEnvPayload;
})();

const getInjectedEnv = (): InjectedEnvPayload | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const candidate = (window as WindowWithEnv).__JUSTEVERY_ENV__;
  if (!candidate || typeof candidate !== 'object') {
    return undefined;
  }
  return candidate;
};

const buildClientEnv = (injected?: InjectedEnvPayload): ClientEnv => {
  const loginOrigin = resolveLoginOrigin(injected?.loginOrigin ?? staticEnv.loginOrigin);
  const betterAuthBaseUrl = ensureBetterAuthBaseUrl(
    injected?.betterAuthBaseUrl ?? staticEnv.betterAuthBaseUrl,
    loginOrigin
  );
  const sessionEndpoint = ensureSessionEndpoint(
    injected?.sessionEndpoint ?? staticEnv.sessionEndpoint,
    betterAuthBaseUrl
  );

  const overrideWorker = trimValue(injected?.workerOrigin ?? staticEnv.workerOrigin);
  const overrideWorkerLocal = trimValue(injected?.workerOriginLocal ?? staticEnv.workerOriginLocal);
  const workerOrigin = resolveWorkerOrigin(overrideWorker, overrideWorkerLocal);

  return {
    loginOrigin,
    betterAuthBaseUrl,
    sessionEndpoint,
    workerOrigin,
    workerOriginLocal: overrideWorkerLocal ?? workerOrigin,
  };
};

export const resolveClientEnv = (): ClientEnv => {
  return buildClientEnv(getInjectedEnv());
};

export const usePublicEnv = (): ClientEnv => {
  const [env, setEnv] = React.useState<ClientEnv>(() => resolveClientEnv());

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const target = window as WindowWithEnv;

    const update = (payload?: InjectedEnvPayload) => {
      setEnv(buildClientEnv(payload ?? target.__JUSTEVERY_ENV__));
    };

    update(target.__JUSTEVERY_ENV__);

    const handler = (event: Event) => {
      const detail = 'detail' in event ? (event as CustomEvent<InjectedEnvPayload>).detail : undefined;
      update(detail);
    };

    window.addEventListener('justevery:env-ready', handler as EventListener);
    return () => window.removeEventListener('justevery:env-ready', handler as EventListener);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let cancelled = false;

    const loadRuntimeEnv = async () => {
      try {
        const response = await fetch('/api/runtime-env', { headers: { Accept: 'application/json' } });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as InjectedEnvPayload;
        if (!cancelled) {
          setEnv(buildClientEnv(payload));
        }
      } catch (runtimeError) {
        console.warn('Failed to fetch runtime env', runtimeError);
      }
    };

    void loadRuntimeEnv();

    return () => {
      cancelled = true;
    };
  }, []);

  return env;
};

function resolveWorkerOrigin(remote?: string | null, local?: string | null): string | undefined {
  const trimmedRemote = remote?.trim() || undefined;
  const trimmedLocal = local?.trim() || undefined;

  if (typeof window === 'undefined') {
    return trimmedRemote ?? trimmedLocal;
  }

  const host = window.location.hostname;
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  if (isLocalHost) {
    if (trimmedLocal) {
      return trimmedLocal;
    }
    return window.location.origin;
  }

  return trimmedRemote ?? window.location.origin;
}

function resolveLoginOrigin(value?: string | null): string {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate) {
    return DEFAULT_LOGIN_ORIGIN;
  }
  try {
    const url = new URL(candidate);
    return trimTrailingSlash(url.toString());
  } catch {
    try {
      const sanitized = candidate.replace(/^\/+/, '');
      const url = new URL(`https://${sanitized}`);
      return trimTrailingSlash(url.toString());
    } catch {
      return DEFAULT_LOGIN_ORIGIN;
    }
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function trimValue(value?: string | null): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
