import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { SessionClient, SessionClientError, type SessionPayload } from '@justevery/auth-client';
import {
  DEFAULT_LOGIN_ORIGIN,
  ensureBetterAuthBaseUrl,
  ensureSessionEndpoint,
} from '@justevery/config/auth';

export type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

export interface AuthProviderProps {
  readonly children?: React.ReactNode;
  readonly loginOrigin?: string;
  readonly betterAuthBaseUrl?: string;
  readonly sessionEndpoint?: string;
}

type AuthContextValue = {
  status: AuthStatus;
  isAuthenticated: boolean;
  session: SessionPayload | null;
  loginOrigin: string;
  betterAuthBaseUrl: string;
  sessionEndpoint: string;
  refresh: () => Promise<void>;
  signOut: (options?: { returnUrl?: string }) => Promise<void>;
  openHostedLogin: (options?: { returnPath?: string }) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({
  children,
  loginOrigin = DEFAULT_LOGIN_ORIGIN,
  betterAuthBaseUrl,
  sessionEndpoint,
}: AuthProviderProps) => {
  const sanitizedLoginOrigin = trimTrailingSlash(loginOrigin) || DEFAULT_LOGIN_ORIGIN;
  const resolvedApiBase = ensureBetterAuthBaseUrl(betterAuthBaseUrl, sanitizedLoginOrigin);
  const resolvedSessionEndpoint = ensureSessionEndpoint(sessionEndpoint, resolvedApiBase);
  const lastSyncedTokenRef = useRef<string | null>(null);

  const client = useMemo(() => new SessionClient({ baseUrl: resolvedApiBase }), [resolvedApiBase]);

  const [state, setState] = useState<{ status: AuthStatus; session: SessionPayload | null }>(
    () => ({ status: 'checking', session: null })
  );

  const syncWorkerSession = useCallback(async (token?: string | null, snapshot?: SessionPayload | null) => {
    if (!token || lastSyncedTokenRef.current === token) {
      return;
    }
    try {
      const response = await fetch('/api/session/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, session: snapshot ?? undefined }),
      });
      if (response.ok) {
        lastSyncedTokenRef.current = token;
      }
    } catch (error) {
      console.warn('Failed to sync worker session', error);
    }
  }, []);

  const resolveSession = useCallback(async (): Promise<SessionPayload | null> => {
    try {
      const payload = await client.getSession();
      if (hasActiveSession(payload)) {
        void syncWorkerSession(payload.session?.token as string | undefined, payload);
        return payload;
      }
      return null;
    } catch (error) {
      if (!(error instanceof SessionClientError && error.status === 401)) {
        console.warn('Failed to fetch session', error);
      }
      return null;
    }
  }, [client, syncWorkerSession]);

  const refresh = useCallback(async () => {
    const payload = await resolveSession();
    setState(payload ? { status: 'authenticated', session: payload } : { status: 'unauthenticated', session: null });
  }, [resolveSession]);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      const payload = await resolveSession();
      if (!cancelled) {
        setState(
          payload ? { status: 'authenticated', session: payload } : { status: 'unauthenticated', session: null }
        );
      }
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [resolveSession]);

  const signOut = useCallback(
    async (options?: { returnUrl?: string }) => {
      await client.signOut(options?.returnUrl);
      setState({ status: 'unauthenticated', session: null });
      lastSyncedTokenRef.current = null;
    },
    [client]
  );

  const openHostedLogin = useCallback(
    (options?: { returnPath?: string }) => {
      if (typeof window === 'undefined') {
        return;
      }
      const loginUrl = new URL('/', sanitizedLoginOrigin);
      const target = options?.returnPath ?? resolveCurrentPath();
      loginUrl.searchParams.set('return', resolveReturnUrl(target));
      window.location.assign(loginUrl.toString());
    },
    [sanitizedLoginOrigin]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      isAuthenticated: state.status === 'authenticated',
      session: state.session,
      loginOrigin: sanitizedLoginOrigin,
      betterAuthBaseUrl: resolvedApiBase,
      sessionEndpoint: resolvedSessionEndpoint,
      refresh,
      signOut,
      openHostedLogin,
    }),
    [
      openHostedLogin,
      refresh,
      resolvedApiBase,
      resolvedSessionEndpoint,
      sanitizedLoginOrigin,
      signOut,
      state.session,
      state.status,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

function trimTrailingSlash(value: string | undefined): string {
  if (!value) {
    return '';
  }
  return value.replace(/\/+$/, '');
}

function resolveReturnUrl(path: string): string {
  if (typeof window === 'undefined') {
    return path;
  }
  try {
    const url = new URL(path, window.location.origin);
    return url.toString();
  } catch {
    return window.location.origin;
  }
}

function resolveCurrentPath(): string {
  if (typeof window === 'undefined') {
    return '/app/overview';
  }
  const candidate = window.location.pathname + window.location.search + window.location.hash;
  return candidate && candidate !== '/' ? candidate : '/app/overview';
}

function hasActiveSession(payload: SessionPayload | null): payload is SessionPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  return Boolean(payload.session && typeof payload.session === 'object');
}
