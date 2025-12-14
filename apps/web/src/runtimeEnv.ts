import * as React from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

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
  const read = (value: unknown): string | undefined => {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  return {
    // Keep direct process.env access so Expo/Metro can inline EXPO_PUBLIC_* values in the web bundle.
    loginOrigin: read(process.env.EXPO_PUBLIC_LOGIN_ORIGIN) ?? read(process.env.LOGIN_ORIGIN),
    betterAuthBaseUrl: read(process.env.EXPO_PUBLIC_BETTER_AUTH_URL) ?? read(process.env.BETTER_AUTH_URL),
    sessionEndpoint: read(process.env.EXPO_PUBLIC_SESSION_ENDPOINT) ?? read(process.env.SESSION_ENDPOINT),
    workerOrigin: read(process.env.EXPO_PUBLIC_WORKER_ORIGIN),
    workerOriginLocal: read(process.env.EXPO_PUBLIC_WORKER_ORIGIN_LOCAL),
  } satisfies InjectedEnvPayload;
})();

let runtimeEnvPromise: Promise<InjectedEnvPayload | undefined> | null = null;

const fetchRuntimeEnvOnce = () => {
  if (runtimeEnvPromise) {
    return runtimeEnvPromise;
  }
  runtimeEnvPromise = (async () => {
    try {
      const response = await fetch('/api/runtime-env', { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        return undefined;
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!/application\/json/i.test(contentType)) {
        return undefined;
      }
      try {
        return (await response.json()) as InjectedEnvPayload;
      } catch (parseError) {
        console.warn('Failed to parse runtime env payload', parseError);
        return undefined;
      }
    } catch (runtimeError) {
      console.warn('Failed to fetch runtime env', runtimeError);
      return undefined;
    }
  })();
  return runtimeEnvPromise;
};

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
  const resolvedLoginOrigin = resolveLoginOrigin(injected?.loginOrigin ?? staticEnv.loginOrigin);
  const loginOrigin = replaceLocalhost(resolvedLoginOrigin) ?? resolvedLoginOrigin;

  const ensuredBetterAuthBaseUrl = ensureBetterAuthBaseUrl(
    injected?.betterAuthBaseUrl ?? staticEnv.betterAuthBaseUrl,
    loginOrigin
  );
  const betterAuthBaseUrl = replaceLocalhost(ensuredBetterAuthBaseUrl) ?? ensuredBetterAuthBaseUrl;

  const ensuredSessionEndpoint = ensureSessionEndpoint(
    injected?.sessionEndpoint ?? staticEnv.sessionEndpoint,
    betterAuthBaseUrl
  );
  const sessionEndpoint = replaceLocalhost(ensuredSessionEndpoint) ?? ensuredSessionEndpoint;

  const overrideWorker = replaceLocalhost(
    trimValue(injected?.workerOrigin ?? staticEnv.workerOrigin)
  ) ?? trimValue(injected?.workerOrigin ?? staticEnv.workerOrigin);

  const overrideWorkerLocal = replaceLocalhost(
    trimValue(injected?.workerOriginLocal ?? staticEnv.workerOriginLocal)
  ) ?? trimValue(injected?.workerOriginLocal ?? staticEnv.workerOriginLocal);

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
    if (
      typeof window === 'undefined' ||
      typeof window.addEventListener !== 'function' ||
      typeof window.removeEventListener !== 'function'
    ) {
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
    if (typeof window === 'undefined' || Platform.OS !== 'web') {
      return;
    }

    let cancelled = false;

    fetchRuntimeEnvOnce().then((payload) => {
      if (!cancelled && payload) {
        setEnv(buildClientEnv(payload));
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return env;
};

function resolveWorkerOrigin(remote?: string | null, local?: string | null): string | undefined {
  const trimmedRemote = remote?.trim() || undefined;
  const trimmedLocal = local?.trim() || undefined;

  const host = typeof window !== 'undefined' ? window.location?.hostname : undefined;
  if (!host) {
    return trimmedRemote ?? trimmedLocal;
  }

  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  if (isLocalHost) {
    if (trimmedLocal) {
      return trimmedLocal;
    }
    return window.location.origin;
  }

  const origin = typeof window !== 'undefined' ? window.location?.origin : undefined;
  return trimmedRemote ?? origin;
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

export function replaceLocalhost(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);
    if (!isLocalHost(url.hostname)) {
      return url.toString();
    }

    const replacementHost = resolveHostForDevice();
    if (!replacementHost) {
      return url.toString();
    }

    url.hostname = replacementHost;
    return url.toString();
  } catch {
    return trimmed;
  }
}

function resolveHostForDevice(): string | null {
  if (Platform.OS === 'android') {
    return '10.0.2.2';
  }

  if (Platform.OS === 'ios') {
    const hostUri =
      (Constants as { expoConfig?: { hostUri?: string } }).expoConfig?.hostUri ??
      // manifest2 for Expo Router projects (fallback).
      (Constants as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } }).manifest2?.extra
        ?.expoClient?.hostUri;

    if (hostUri) {
      try {
        const parsed = new URL(`http://${hostUri}`);
        if (parsed.hostname) {
          return parsed.hostname;
        }
      } catch {
        // ignore parsing errors and fall through
      }
    }

    return '127.0.0.1';
  }

  if (Platform.OS === 'web') {
    return '127.0.0.1';
  }

  return null;
}

const isLocalHost = (host?: string | null): boolean => {
  if (!host) return false;
  return host === 'localhost' || host === '127.0.0.1';
};
