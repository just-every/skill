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
  authError?: string;
  loginOrigin: string;
  betterAuthBaseUrl: string;
  sessionEndpoint: string;
  workerBase: string;
  refresh: () => Promise<void>;
  signOut: (options?: { returnUrl?: string }) => Promise<void>;
  openHostedLogin: (options?: { returnPath?: string; showProfilePopup?: boolean; popupSection?: string }) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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

  const resolveSession = useCallback(async (): Promise<SessionPayload | null> => {
    // First try Better Auth directly (requires cookie). Works when login is performed inside the in-app webview.
    try {
      const payload = await client.getSession();
      if (hasActiveSession(payload)) {
        void syncWorkerSession(payload.session?.token as string | undefined, payload);
        return payload;
      }
    } catch (error) {
      if (!(error instanceof SessionClientError && error.status === 401)) {
        const message = error instanceof Error ? error.message : 'Unknown authentication error';
        console.warn('Failed to fetch session from login origin', error);
        setState({ status: 'error', session: null, error: message });
      }
    }

    // Fallback: try worker API (in case cookie already bootstrapped).
    try {
      const response = await fetch(`${workerBase}/api/me`, {
        method: 'GET',
        credentials: 'include',
        headers: { accept: 'application/json' },
      });

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as { session?: { session_id?: string; email_address?: string; expires_at?: string } };
      if (!payload?.session?.session_id) {
        return null;
      }

      const session: SessionPayload = {
        session: {
          id: payload.session.session_id ?? 'session',
          token: payload.session.session_id ?? 'session',
          expiresAt: payload.session.expires_at,
        },
        user: {
          email: payload.session.email_address ?? '',
        },
      } as SessionPayload;

      return session;
    } catch (error) {
      // Worker may be offline in dev; fall back to unauthenticated instead of hard error.
      const message = error instanceof Error ? error.message : 'Unknown authentication error';
      console.warn('Failed to fetch session from worker (treating as unauthenticated)', error);
      setState({ status: 'unauthenticated', session: null, error: null });
      return null;
    }
  }, [client, syncWorkerSession, workerBase]);

  const refresh = useCallback(async () => {
    const payload = await resolveSession();
    setState(payload ? { status: 'authenticated', session: payload } : { status: 'unauthenticated', session: null });
  }, [resolveSession]);

  const bootstrapFromToken = useCallback(async (token: string) => {
    const trimmed = token.trim();
    if (!trimmed || processedTokensRef.current.has(trimmed)) {
      return;
    }
    processedTokensRef.current.add(trimmed);

    try {
      const response = await fetch(`${workerBase}/api/session/bootstrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: trimmed }),
      });

      if (!response.ok) {
        const payload = await safeJson(response);
        const message = payload?.error ?? `Session bootstrap failed (${response.status})`;
        console.warn('[auth] bootstrap failed', response.status, payload);
        setState({ status: 'error', session: null, error: message });
        return;
      }

      console.info('[auth] Bootstrapped session from callback token');
      await refresh();
    } catch (error) {
      logError(error, 'bootstrapFromToken');
      const message = error instanceof Error ? error.message : 'Session bootstrap failed';
      setState({ status: 'error', session: null, error: message });
    }
  }, [refresh, workerBase]);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      const payload = await resolveSession();
      if (!cancelled) {
        if (payload) {
          setState({ status: 'authenticated', session: payload, error: null });
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
  }, [resolveSession]);

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
    },
    [workerBase]
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
      authError: state.error ?? undefined,
      loginOrigin: sanitizedLoginOrigin,
      betterAuthBaseUrl: resolvedApiBase,
      sessionEndpoint: resolvedSessionEndpoint,
      workerBase,
      refresh,
      signOut,
      openHostedLogin,
    }),
    [
      openHostedLogin,
      refresh,
      resolvedApiBase,
      resolvedSessionEndpoint,
      workerBase,
      sanitizedLoginOrigin,
      signOut,
      state.session,
      state.status,
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

      if (isReturnToApp(nextUrl)) {
        console.info('[auth][login] return to app detected', nextUrl);
        onClose();
        onAuthenticated(nextUrl);
        return false;
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
                  token,
                });
                if (token) {
                  console.info('[auth][login][webview] session token raw', token);
                }
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

const isReturnToApp = (value: string): boolean => {
  try {
    const url = new URL(value);
    const scheme = url.protocol.replace(':', '').toLowerCase();
    if (scheme === 'exp' || scheme === 'bareexpo' || scheme === 'justevery') return true;

    if (Platform.OS !== 'web') {
      const appOrigin = getAppOrigin();
      if (appOrigin && value.startsWith(appOrigin)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
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
