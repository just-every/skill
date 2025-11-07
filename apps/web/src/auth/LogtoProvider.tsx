import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';

import type { LogtoConfig } from '@logto/rn';
import { LogtoProvider as NativeLogtoProvider, useLogto as useNativeLogto } from '@logto/rn';

import { usePublicEnv } from '../runtimeEnv';

const isBrowser = typeof window !== 'undefined';

type RedirectAuthContextValue = {
  isAuthenticated: boolean;
  isInitialized: boolean;
  setAuthenticated: (value: boolean) => void;
  workerOrigin: string | undefined;
};

const RedirectAuthContext = createContext<RedirectAuthContextValue | null>(null);

const RedirectAuthProvider = ({ children }: { children: ReactNode }) => {
  const env = usePublicEnv();
  const [state, setState] = useState<{ isAuthenticated: boolean; isInitialized: boolean }>({
    isAuthenticated: false,
    isInitialized: false
  });

  useEffect(() => {
    if (!isBrowser) {
      return;
    }

    let cancelled = false;
    const checkSession = async () => {
      try {
        const response = await fetch(buildWorkerUrl(env, '/auth/token'), {
          method: 'GET',
          credentials: 'include'
        });
        if (cancelled) {
          return;
        }
        setState({ isAuthenticated: response.ok, isInitialized: true });
      } catch {
        if (!cancelled) {
          setState({ isAuthenticated: false, isInitialized: true });
        }
      }
    };

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, [env]);

  const value = useMemo<RedirectAuthContextValue>(
    () => ({
      isAuthenticated: state.isAuthenticated,
      isInitialized: state.isInitialized,
      setAuthenticated: (next) => {
        setState((prev) => ({ ...prev, isAuthenticated: next }));
      },
      workerOrigin: env.workerOrigin
    }),
    [env.workerOrigin, state.isAuthenticated, state.isInitialized]
  );

  return <RedirectAuthContext.Provider value={value}>{children}</RedirectAuthContext.Provider>;
};

type NativeLogtoHook = ReturnType<typeof useNativeLogto> & {
  mode: 'popup';
};

type RedirectLogtoHook = {
  client: null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  mode: 'redirect';
  signIn: (returnUri: string) => void;
  signOut: (redirectUri?: string) => Promise<void>;
  getAccessToken: (resource?: string) => Promise<string>;
  getIdTokenClaims: () => Promise<unknown>;
  fetchUserInfo: () => Promise<unknown>;
  getRefreshToken: () => Promise<null>;
};

export type HybridLogtoHook = RedirectLogtoHook | NativeLogtoHook;

export const HybridLogtoProvider = ({ config, children }: { config: LogtoConfig; children: ReactNode }) => {
  if (Platform.OS === 'web') {
    return <RedirectAuthProvider>{children}</RedirectAuthProvider>;
  }
  return <NativeLogtoProvider config={config}>{children}</NativeLogtoProvider>;
};

export const useLogto = (): HybridLogtoHook => {
  if (Platform.OS === 'web') {
    return useRedirectLogto();
  }
  const native = useNativeLogto();
  return {
    ...native,
    mode: 'popup'
  } satisfies HybridLogtoHook;
};

const useRedirectLogto = (): RedirectLogtoHook => {
  const context = useContext(RedirectAuthContext);
  if (!context) {
    throw new Error('useLogto must be used within a HybridLogtoProvider');
  }

  const buildUrl = useCallback(
    (path: string) => {
      return buildWorkerUrl({ workerOrigin: context.workerOrigin }, path);
    },
    [context.workerOrigin]
  );

  const signIn = useCallback(
    (returnUri: string) => {
      if (!isBrowser) {
        return;
      }
      const target = sanitiseReturnTarget(returnUri ?? window.location.href);
      const url = new URL(buildUrl('/auth/sign-in'));
      url.searchParams.set('return', target);
      window.location.assign(url.toString());
    },
    [buildUrl]
  );

  const signOut = useCallback(
    async (redirectUri?: string) => {
      const url = new URL(buildUrl('/auth/sign-out'));
      if (redirectUri) {
        url.searchParams.set('return', redirectUri);
      }
      await fetch(url.toString(), {
        method: 'POST',
        credentials: 'include'
      });
      context.setAuthenticated(false);
      if (isBrowser) {
        window.location.assign(redirectUri ?? '/');
      }
    },
    [buildUrl, context]
  );

  const getAccessToken = useCallback(
    async (resource?: string) => {
      const url = new URL(buildUrl('/auth/token'));
      if (resource) {
        url.searchParams.set('resource', resource);
      }
      const data = await fetchJson<{ token: string }>(url.toString());
      context.setAuthenticated(true);
      return data.token;
    },
    [buildUrl, context]
  );

  const getIdTokenClaims = useCallback(async () => {
    const data = await fetchJson<unknown>(buildUrl('/auth/id-token'));
    context.setAuthenticated(true);
    return data;
  }, [buildUrl, context]);

  const fetchUserInfo = useCallback(async () => {
    const data = await fetchJson<unknown>(buildUrl('/auth/userinfo'));
    context.setAuthenticated(true);
    return data;
  }, [buildUrl, context]);

  const getRefreshToken = useCallback(async () => {
    return null;
  }, []);

  return {
    client: null,
    isAuthenticated: context.isAuthenticated,
    isInitialized: context.isInitialized,
    mode: 'redirect',
    signIn,
    signOut,
    getAccessToken,
    getIdTokenClaims,
    fetchUserInfo,
    getRefreshToken
  };
};

function buildWorkerUrl(env: { workerOrigin?: string }, path: string): string {
  if (!isBrowser) {
    return `${env.workerOrigin ?? ''}${path}`;
  }
  const base = env.workerOrigin ?? window.location.origin;
  return `${base.replace(/\/$/, '')}${path}`;
}

function sanitiseReturnTarget(candidate: string): string {
  if (!isBrowser) {
    return '/app';
  }
  try {
    const base = window.location.origin;
    const url = new URL(candidate, base);
    if (url.origin !== base) {
      return `${base}/app`;
    }
    if (url.pathname === '/callback' || url.pathname.startsWith('/auth/')) {
      return `${base}/app`;
    }
    return url.toString();
  } catch {
    return '/app';
  }
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) {
    throw new Error('Request failed');
  }
  return (await response.json()) as T;
}
