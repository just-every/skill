import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Modal, Platform, SafeAreaView, View } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { SessionClient, SessionClientError, type SessionPayload } from '@justevery/auth-client';
import {
  DEFAULT_LOGIN_ORIGIN,
  ensureBetterAuthBaseUrl,
  ensureSessionEndpoint,
} from '@justevery/config/auth';
import WebView from 'react-native-webview';
import { logError } from '../debug/errorLogging';
import { isReturnToAppUrl } from './returnToApp';

const DEBUG_AUTOTAP_LOGIN = process.env.EXPO_PUBLIC_AUTOTAP_LOGIN === '1';

const WEBVIEW_DEBUG_BRIDGE = `(() => {
  const send = (type, payload = {}) => {
    try {
      if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload }));
      }
    } catch (_) {
      /* noop */
    }
  };

  send('debug:init', { ua: navigator.userAgent, url: location.href });

  window.addEventListener('error', (e) => {
    send('debug:error', { message: e?.message, source: e?.filename, line: e?.lineno, col: e?.colno });
  });

  const reportDom = () => {
    try {
      const buttons = Array.from(document.querySelectorAll('button')).map((btn) =>
        (btn.textContent || btn.innerText || '').trim()
      );
      send('debug:dom', { buttons });
    } catch (error) {
      send('debug:dom-error', { message: error?.message ?? String(error) });
    }
  };

  const tap = () => {
    try {
      const buttons = Array.from(document.querySelectorAll('button'));
      const match = buttons.find((btn) => /sign\s*in/i.test(btn.textContent || btn.innerText || '')) || buttons[0];
      if (!match) {
        send('debug:login-no-button');
        return;
      }
      match.click();
      send('debug:login-clicked');
    } catch (error) {
      send('debug:login-error', { message: error?.message ?? String(error) });
    }
  };

  const checkSession = async () => {
    try {
      const res = await fetch('/api/auth/session', { credentials: 'include' });
      const json = await res.json();
      send('session', { status: res.status, ok: res.ok, body: json });
    } catch (error) {
      send('debug:session-error', { message: error?.message ?? String(error) });
    }
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    reportDom();
    tap();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      reportDom();
      tap();
    }, { once: true });
  }

  setTimeout(reportDom, 1500);
  setTimeout(tap, 2000);
  setTimeout(checkSession, 2500);
})(); true;`;

export type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated' | 'error';

export interface AuthProviderProps {
  readonly children?: React.ReactNode;
  readonly loginOrigin?: string;
  readonly betterAuthBaseUrl?: string;
  readonly sessionEndpoint?: string;
  readonly workerOrigin?: string;
  readonly workerOriginLocal?: string;
}

type AuthContextValue = {
  status: AuthStatus;
  isAuthenticated: boolean;
  session: SessionPayload | null;
  sessionToken: string | null;
  authError?: string;
  loginOrigin: string;
  betterAuthBaseUrl: string;
  sessionEndpoint: string;
  workerBase: string;
  refresh: () => Promise<void>;
  bootstrapToken: (token: string) => Promise<boolean>;
  signOut: (options?: { returnUrl?: string }) => Promise<void>;
  openHostedLogin: (options?: { returnPath?: string; showProfilePopup?: boolean; popupSection?: string }) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const buildSessionCookieHeader = (token: string): string => {
  const encoded = encodeURIComponent(token);
  return `__Secure-better-auth.session_token=${encoded}; better-auth.session_token=${encoded}`;
};

export const AuthProvider = ({
  children,
  loginOrigin = DEFAULT_LOGIN_ORIGIN,
  betterAuthBaseUrl,
  sessionEndpoint,
  workerOrigin,
  workerOriginLocal,
}: AuthProviderProps) => {
  const sanitizedLoginOrigin = trimTrailingSlash(loginOrigin) || DEFAULT_LOGIN_ORIGIN;
  const resolvedApiBase = ensureBetterAuthBaseUrl(betterAuthBaseUrl, sanitizedLoginOrigin);
  const resolvedSessionEndpoint = ensureSessionEndpoint(sessionEndpoint, resolvedApiBase);
  const lastSyncedTokenRef = useRef<string | null>(null);
  const workerBase = useMemo(
    () => resolveWorkerBase(workerOrigin, workerOriginLocal, resolvedSessionEndpoint, resolvedApiBase),
    [resolvedApiBase, resolvedSessionEndpoint, workerOrigin, workerOriginLocal]
  );
  const [loginOverlayUrl, setLoginOverlayUrl] = useState<string | null>(null);

  const client = useMemo(() => new SessionClient({ baseUrl: resolvedApiBase }), [resolvedApiBase]);

  const [state, setState] = useState<{
    status: AuthStatus;
    session: SessionPayload | null;
    error?: string | null;
  }>(() => ({ status: 'checking', session: null, error: null }));

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const sessionTokenRef = useRef<string | null>(null);

  const setSessionTokenIfNeeded = useCallback((token?: string | null) => {
    if (!token) {
      return;
    }
    const trimmed = token.trim();
    if (!trimmed || sessionTokenRef.current === trimmed) {
      return;
    }
    // On native, we only keep signed cookie tokens (contain a dot).
    if (Platform.OS !== 'web' && !trimmed.includes('.')) {
      return;
    }
    sessionTokenRef.current = trimmed;
    setSessionToken(trimmed);
  }, []);

  const clearSessionToken = useCallback(() => {
    if (sessionTokenRef.current === null) {
      return;
    }
    sessionTokenRef.current = null;
    setSessionToken(null);
  }, []);

  const lastGoodSessionRef = useRef<SessionPayload | null>(null);

  const processedTokensRef = useRef<Set<string>>(new Set());

  const syncWorkerSession = useCallback(async (token?: string | null, snapshot?: SessionPayload | null) => {
    if (!token || lastSyncedTokenRef.current === token) {
      return;
    }
    try {
      const response = await fetch(`${workerBase}/api/session/bootstrap`, {
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
  }, [workerBase]);

  const fetchWithTimeout = useCallback(async (
    url: string,
    init: RequestInit,
    timeoutMs: number,
    label: string
  ) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(`${label} timed out after ${timeoutMs}ms`), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timer);
    }
  }, []);

  const withTimeout = useCallback(async <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }, []);

  const fetchWorkerSession = useCallback(async (): Promise<SessionPayload | null> => {
    try {
      const headers: Record<string, string> = { accept: 'application/json' };
      if (sessionTokenRef.current) {
        headers['x-session-token'] = sessionTokenRef.current;
        if (Platform.OS !== 'web') {
          headers.cookie = buildSessionCookieHeader(sessionTokenRef.current);
        }
      }
      const response = await fetchWithTimeout(
        `${workerBase}/api/me`,
        {
          method: 'GET',
          credentials: 'include',
          headers,
        },
        1500,
        'worker /api/me'
      );

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as {
        session?: { session_id?: string; session_token?: string | null; email_address?: string; expires_at?: string };
      };
      if (!payload?.session?.session_id && !payload?.session?.session_token) {
        return null;
      }

      const token = payload.session.session_token || payload.session.session_id || 'session';

      const session: SessionPayload = {
        session: {
          id: payload.session.session_id ?? 'session',
          token,
          expiresAt: payload.session.expires_at,
        },
        user: {
          email: payload.session.email_address ?? '',
        },
      } as SessionPayload;

      return session;
    } catch (error) {
      // Worker may be offline in dev; treat as soft failure.
      const message = error instanceof Error ? error.message : 'Unknown authentication error';
      console.warn('Failed to fetch session from worker (soft failure)', message);
      return null;
    }
  }, [fetchWithTimeout, workerBase]);

  const resolveSession = useCallback(async (): Promise<SessionPayload | null> => {
    const loginPromise = withTimeout(client.getSession(), 1500, 'login session')
      .then((payload) => {
        if (hasActiveSession(payload)) {
          return payload;
        }
        return null;
      })
      .catch((error) => {
        if (!(error instanceof SessionClientError && error.status === 401)) {
          console.warn('Failed to fetch session from login origin', error);
        }
        return null;
      });

    const workerPromise = fetchWorkerSession();

    const [loginResult, workerResult] = await Promise.allSettled([loginPromise, workerPromise]);

    const session = [loginResult, workerResult]
      .map((r) => (r.status === 'fulfilled' ? r.value : null))
      .find((value): value is SessionPayload => Boolean(value));

    if (session) {
      lastGoodSessionRef.current = session;
      const token = session.session?.token;
      if (token && token.includes('.')) {
        void syncWorkerSession(token, session);
      }
      return session;
    }

    return lastGoodSessionRef.current;
  }, [client, fetchWorkerSession, syncWorkerSession, withTimeout]);

  const refresh = useCallback(async () => {
    const payload = await resolveSession();
    if (payload) {
      setState({ status: 'authenticated', session: payload, error: null });
      lastGoodSessionRef.current = payload;
    } else if (lastGoodSessionRef.current) {
      setState({ status: 'authenticated', session: lastGoodSessionRef.current, error: null });
    } else {
      setState({ status: 'unauthenticated', session: null, error: null });
    }
  }, [resolveSession]);

  const bootstrapFromToken = useCallback(async (token: string): Promise<boolean> => {
    const trimmed = token.trim();
    if (!trimmed || processedTokensRef.current.has(trimmed)) {
      return false;
    }

    setSessionTokenIfNeeded(trimmed);
    let bootstrapError: string | null = null;

    try {
      const response = await fetch(`${workerBase}/api/session/bootstrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: trimmed }),
      });

      if (!response.ok) {
        const payload = await safeJson(response);
        bootstrapError =
          (typeof payload?.error_description === 'string' && payload.error_description.trim())
            ? payload.error_description.trim()
            : (typeof payload?.error === 'string' && payload.error.trim())
              ? payload.error.trim()
              : `Session bootstrap failed (${response.status})`;
        console.warn('[auth] bootstrap failed', response.status, payload);
      }
    } catch (error) {
      logError(error, 'bootstrapFromToken');
      bootstrapError = error instanceof Error ? error.message : 'Session bootstrap failed';
    }

    const session = await resolveSession();
    if (session) {
      setState({ status: 'authenticated', session, error: null });
      lastGoodSessionRef.current = session;
      processedTokensRef.current.add(trimmed);
      void writeNativeTestSessionToken(trimmed);
      return true;
    }

    if (bootstrapError) {
      setState({ status: 'error', session: null, error: bootstrapError });
      return false;
    }

    setState({ status: 'unauthenticated', session: null, error: null });
    return false;
  }, [resolveSession, setSessionTokenIfNeeded, workerBase]);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      if (Platform.OS !== 'web') {
        const envToken = readNativeEnvTestSessionToken();
        if (envToken) {
          await bootstrapFromToken(envToken);
        } else {
          const nativeToken = await readNativeTestSessionToken();
          if (nativeToken) {
            await bootstrapFromToken(nativeToken);
          }
        }
      }
      const cookieToken = readCookieSessionToken();
      if (Platform.OS === 'web' && cookieToken && !lastGoodSessionRef.current) {
        const optimisticSession: SessionPayload = {
          session: {
            id: cookieToken,
            token: cookieToken,
            expiresAt: undefined,
          },
          user: { email: '' },
        } as SessionPayload;
        lastGoodSessionRef.current = optimisticSession;
        setState({ status: 'authenticated', session: optimisticSession, error: null });
        void syncWorkerSession(cookieToken, optimisticSession);
      }

      const payload = await resolveSession();
      if (!cancelled) {
        if (payload) {
          setState({ status: 'authenticated', session: payload, error: null });
          lastGoodSessionRef.current = payload;
        } else if (lastGoodSessionRef.current) {
          setState({ status: 'authenticated', session: lastGoodSessionRef.current, error: null });
        } else {
          setState((prev) =>
            prev.status === 'error'
              ? prev
              : { status: 'unauthenticated', session: null, error: null }
          );
        }
      }
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [bootstrapFromToken, resolveSession, syncWorkerSession]);

  useEffect(() => {
    const handleUrl = (url?: string | null) => {
      console.info('[auth][linking] url event', Platform.OS, url);
      const token = extractTokenFromUrl(url);
      if (token) {
        void bootstrapFromToken(token);
      }
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.location?.href) {
        handleUrl(window.location.href);
      }
      return;
    }

    Linking.getInitialURL().then(handleUrl).catch((error) => logError(error, 'linking-initial-url'));
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => subscription.remove();
  }, [bootstrapFromToken]);

  const signOut = useCallback(
    async (options?: { returnUrl?: string }) => {
      try {
        await fetch(`${workerBase}/api/session/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ return: options?.returnUrl }),
        });
      } catch (error) {
        console.warn('Failed to sign out', error);
      }
      setState({ status: 'unauthenticated', session: null });
      lastSyncedTokenRef.current = null;
      lastGoodSessionRef.current = null;
      processedTokensRef.current = new Set();
      clearSessionToken();
      void writeNativeTestSessionToken(null);
    },
    [clearSessionToken, workerBase]
  );

  const openHostedLogin = useCallback(
    (options?: { returnPath?: string; showProfilePopup?: boolean; popupSection?: string }) => {
      const loginUrl = new URL('/', sanitizedLoginOrigin);
      const target = options?.returnPath ?? resolveCurrentPath();

      // For native, force a dedicated callback route so we can reliably intercept the return URL inside the app.
      const returnUrl = Platform.OS === 'web'
        ? resolveReturnUrl(target)
        : buildNativeCallbackUrl(target);

      loginUrl.searchParams.set('return', returnUrl);
      if (options?.showProfilePopup !== false) {
        loginUrl.searchParams.set('profilePopup', '1');
        if (options?.popupSection) {
          loginUrl.searchParams.set('section', options.popupSection);
        }
      }

      const href = loginUrl.toString();

      const isWeb = Platform.OS === 'web';

      // Force in-app WebView on native to keep cookies; never use external browser here.
      if (!isWeb) {
        console.info('[auth][login] opening in-app webview (forced)', href);
        setLoginOverlayUrl(href);
        return;
      }

      // Web behaves as before.
      console.info('[auth][login] navigating window', href);
      window.location.assign(href);
    },
    [sanitizedLoginOrigin]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      isAuthenticated: state.status === 'authenticated',
      session: state.session,
      sessionToken,
      authError: state.error ?? undefined,
      loginOrigin: sanitizedLoginOrigin,
      betterAuthBaseUrl: resolvedApiBase,
      sessionEndpoint: resolvedSessionEndpoint,
      workerBase,
      refresh,
      bootstrapToken: bootstrapFromToken,
      signOut,
      openHostedLogin,
    }),
    [
      bootstrapFromToken,
      openHostedLogin,
      refresh,
      resolvedApiBase,
      resolvedSessionEndpoint,
      workerBase,
      sanitizedLoginOrigin,
      signOut,
      state.session,
      state.status,
      sessionToken,
    ]
  );

  const autoLoginTriggeredRef = useRef(false);
  useEffect(() => {
    if (!DEBUG_AUTOTAP_LOGIN || autoLoginTriggeredRef.current) {
      return;
    }
    autoLoginTriggeredRef.current = true;
    openHostedLogin();
  }, [openHostedLogin]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      {Platform.OS !== 'web' && loginOverlayUrl ? (
        <LoginOverlay
          url={loginOverlayUrl}
          onClose={() => setLoginOverlayUrl(null)}
          onAuthenticated={(maybeUrl) => {
            const token = extractTokenFromUrl(maybeUrl);
            if (token) {
              console.info('[auth][login] token extracted from callback URL');
              void bootstrapFromToken(token);
            } else {
              console.info('[auth][login] no token in callback URL; refreshing session');
              void refresh();
            }
          }}
          onSessionMessage={(sessionToken, payload) => {
            if (sessionToken) {
              console.info('[auth][login] session token from webview');
              void bootstrapFromToken(sessionToken);
              return;
            }
            if (payload) {
              console.info('[auth][login] session payload from webview');
              void syncWorkerSession(payload.session?.token as string | undefined, payload as SessionPayload);
              void refresh();
            }
          }}
        />
      ) : null}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const resolveWorkerBase = (
  workerOrigin: string | undefined,
  workerOriginLocal: string | undefined,
  sessionEndpoint: string,
  betterAuthBaseUrl: string
): string => {
  const candidates = [workerOriginLocal, workerOrigin, sessionEndpoint, betterAuthBaseUrl];

  for (const candidate of candidates) {
    if (isHttpUrl(candidate)) {
      try {
        const url = new URL(candidate as string);
        return trimTrailingSlash(`${url.protocol}//${url.host}`);
      } catch {
        // continue
      }
    }
  }

  // Fallback to a safe default; native fetch requires absolute URLs.
  return 'http://127.0.0.1:8787';
};

function trimTrailingSlash(value: string | undefined): string {
  if (!value) {
    return '';
  }
  return value.replace(/\/+$/, '');
}

const isHttpUrl = (value?: string | null): boolean => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

function extractTokenFromUrl(url?: string | null): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);

    const candidates = [
      parsed.searchParams.get('session_token'),
      parsed.searchParams.get('sessionToken'),
      parsed.searchParams.get('token'),
      parsed.searchParams.get('session'),
    ];

    if (parsed.hash) {
      const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
      candidates.push(
        hashParams.get('session_token'),
        hashParams.get('sessionToken'),
        hashParams.get('token'),
        hashParams.get('session')
      );
    }

    const token = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
    return token ? token.trim() : null;
  } catch (error) {
    logError(error, 'extract-token-from-url');
    return null;
  }
}

function readCookieSessionToken(): string | null {
  if (typeof document === 'undefined') return null;
  const raw = document.cookie ?? '';
  const match = raw
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.toLowerCase().startsWith('better-auth.session_token='));
  if (!match) return null;
  const value = match.split('=')[1] ?? '';
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readNativeEnvTestSessionToken(): string | null {
  if (Platform.OS === 'web') {
    return null;
  }
  const devFlag = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
  if (!devFlag) {
    return null;
  }
  const candidate = process.env.EXPO_PUBLIC_TEST_SESSION_TOKEN;
  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate.trim();
  }
  return null;
}

type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const NATIVE_TEST_SESSION_TOKEN_KEY = 'justevery:test-session-token';
let asyncStoragePromise: Promise<AsyncStorageLike | null> | null = null;

const isNativeTestTokenEnabled = (): boolean => {
  if (Platform.OS === 'web') {
    return false;
  }
  const devFlag = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
  return devFlag || process.env.EXPO_PUBLIC_NATIVE_BOOTSTRAP === '1';
};

const loadAsyncStorage = async (): Promise<AsyncStorageLike | null> => {
  if (!isNativeTestTokenEnabled()) {
    return null;
  }
  if (!asyncStoragePromise) {
    asyncStoragePromise = import('@react-native-async-storage/async-storage')
      .then((mod) => (mod.default ?? mod) as AsyncStorageLike)
      .catch((error) => {
        console.warn('Failed to load async storage', error);
        return null;
      });
  }
  return asyncStoragePromise;
};

async function readNativeTestSessionToken(): Promise<string | null> {
  const storage = await loadAsyncStorage();
  if (!storage) {
    return null;
  }
  try {
    const value = await storage.getItem(NATIVE_TEST_SESSION_TOKEN_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

async function writeNativeTestSessionToken(token: string | null): Promise<void> {
  const storage = await loadAsyncStorage();
  if (!storage) {
    return;
  }
  try {
    if (!token) {
      await storage.removeItem(NATIVE_TEST_SESSION_TOKEN_KEY);
      return;
    }
    await storage.setItem(NATIVE_TEST_SESSION_TOKEN_KEY, token);
  } catch (error) {
    console.warn('Failed to persist native test session token', error);
  }
}

async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const LoginOverlay = ({
  url,
  onClose,
  onAuthenticated,
  onSessionMessage,
}: {
  url: string;
  onClose: () => void;
  onAuthenticated: (url?: string) => void;
  onSessionMessage?: (token: string | null, payload?: unknown) => void;
}) => {
  const handleNavigation = useCallback(
    (event: any) => {
      const nextUrl = event?.url as string | undefined;
      if (!nextUrl) return true;

      const appOrigin = Platform.OS === 'web' ? undefined : getAppOrigin();
      if (isReturnToAppUrl(nextUrl, { appOrigin })) {
        console.info('[auth][login] return to app detected', nextUrl);
        onClose();
        onAuthenticated(nextUrl);
        return false;
      }

      // Avoid iOS system confirmation prompts triggered by non-HTTP(S) navigation.
      try {
        const parsed = new URL(nextUrl);
        const scheme = parsed.protocol.replace(':', '').toLowerCase();
        const isWebScheme = scheme === 'http' || scheme === 'https' || scheme === 'about' || scheme === 'data' || scheme === 'blob';
        if (!isWebScheme) {
          const allowExternal = scheme === 'mailto' || scheme === 'tel' || scheme === 'sms';
          if (allowExternal) {
            Linking.openURL(nextUrl).catch((error) => logError(error, 'login-external-scheme'));
          }
          return false;
        }
      } catch {
        // ignore
      }
      return true;
    },
    [onAuthenticated, onClose]
  );

  return (
    <Modal animationType="slide" visible onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
        <WebView
          source={{ uri: url }}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          startInLoadingState
          injectedJavaScript={DEBUG_AUTOTAP_LOGIN ? WEBVIEW_DEBUG_BRIDGE : undefined}
          onMessage={(event) => {
            const raw = event?.nativeEvent?.data;
            if (!raw) return;
            try {
              const parsed = JSON.parse(raw);
              if (parsed?.type === 'session') {
                const token = parsed.body?.session?.token || parsed.body?.session_token;
                console.info('[auth][login][webview] session payload', {
                  status: parsed.status,
                  ok: parsed.ok,
                  hasToken: Boolean(token),
                  tokenPreview: typeof token === 'string' ? `${token.slice(0, 6)}…${token.slice(-4)}` : null,
                });
                onSessionMessage?.(token ?? null, parsed.body);
                return;
              }
              if (parsed?.type === 'debug:dom' || parsed?.type?.startsWith('debug')) {
                console.info('[auth][login][webview]', parsed.type, parsed.buttons ?? parsed.message ?? parsed);
              }
            } catch (error) {
              console.info('[auth][login][webview]', raw);
            }
          }}
          onLoadStart={(e) => console.info('[auth][login] load start', e?.nativeEvent?.url)}
          onLoadEnd={(e) => console.info('[auth][login] load end', e?.nativeEvent?.url)}
          onShouldStartLoadWithRequest={handleNavigation}
          onNavigationStateChange={handleNavigation}
        />
      </SafeAreaView>
    </Modal>
  );
};

function resolveReturnUrl(path: string): string {
  // Native: return a deep link so we stay inside the app after login.
  if (Platform.OS !== 'web') {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return ExpoLinking.createURL(normalized);
  }

  // Web: absolute HTTP(S) URLs back to the app origin.
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      if (url.hostname === 'localhost') {
        url.hostname = '127.0.0.1';
      }
      return url.toString();
    } catch {
      return path;
    }
  }

  const appOrigin = getAppOrigin();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  try {
    return new URL(normalized, appOrigin).toString();
  } catch {
    return `${appOrigin}${normalized}`;
  }
}

const buildNativeCallbackUrl = (nextPath: string): string => {
  const normalized = nextPath.startsWith('/') ? nextPath : `/${nextPath}`;
  const callback = ExpoLinking.createURL('/callback');
  try {
    const url = new URL(callback);
    url.searchParams.set('return', normalized);
    return url.toString();
  } catch {
    return callback;
  }
};

function getAppOrigin(): string {
  const envOrigin = process.env.EXPO_PUBLIC_APP_ORIGIN?.trim();
  if (envOrigin) {
    return normalizeLoopbackOrigin(envOrigin);
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.location?.origin === 'string') {
    return normalizeLoopbackOrigin(window.location.origin);
  }

  // Native sensible defaults for dev
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8081';
  }
  if (Platform.OS === 'ios') {
    return 'http://127.0.0.1:8081';
  }

  // Last resort: use the Expo linking base (exp://...)
  const base = ExpoLinking.createURL('/');
  return base.replace(/\/$/, '');
}

// Ensure we never emit return URLs on "localhost" (Better Auth cookies are scoped to 127.0.0.1 in dev).
function normalizeLoopbackOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost') {
      url.hostname = '127.0.0.1';
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    // best-effort fallback
    return origin.replace(/\/$/, '').replace('localhost', '127.0.0.1');
  }
}

function resolveCurrentPath(): string {
  if (typeof window === 'undefined' || !window.location) {
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
