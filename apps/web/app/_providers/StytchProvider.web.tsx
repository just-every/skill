import {
  type PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

import { StytchProvider as StytchReactProvider } from '@stytch/react';
import { StytchUIClient } from '@stytch/vanilla-js';

export const StytchReadyContext = createContext<boolean>(false);
export const StytchErrorContext = createContext<string | null>(null);

const RUNTIME_ENV_EVENT = 'justevery:env-ready';

type RuntimeEnvDetail = {
  stytchPublicToken?: string | null;
  stytchBaseUrl?: string | null;
};

type RuntimeConfig = {
  token: string | undefined;
  baseUrl: string | undefined;
};

export function useStytchReady(): boolean {
  return useContext(StytchReadyContext);
}

export function useStytchError(): string | null {
  return useContext(StytchErrorContext);
}

function normalise(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readInjectedEnv(): RuntimeEnvDetail | undefined {
  const globalEnv = globalThis as {
    __JUSTEVERY_ENV__?: RuntimeEnvDetail;
  };

  return globalEnv.__JUSTEVERY_ENV__;
}

function readProcessToken(): string | undefined {
  try {
    if (typeof process !== 'undefined' && process.env) {
      return normalise(process.env.EXPO_PUBLIC_STYTCH_PUBLIC_TOKEN);
    }
  } catch {
    // noop – process may not be defined in the browser
  }
  return undefined;
}

function readProcessBaseUrl(): string | undefined {
  try {
    if (typeof process !== 'undefined' && process.env) {
      return normalise(process.env.EXPO_PUBLIC_STYTCH_BASE_URL);
    }
  } catch {
    // noop
  }
  return undefined;
}

function resolveRuntimeConfig(detail?: RuntimeEnvDetail): RuntimeConfig {
  const injected = readInjectedEnv();
  return {
    token:
      normalise(detail?.stytchPublicToken) ??
      normalise(injected?.stytchPublicToken) ??
      readProcessToken(),
    baseUrl:
      normalise(detail?.stytchBaseUrl) ??
      normalise(injected?.stytchBaseUrl) ??
      readProcessBaseUrl(),
  };
}

export default function StytchProvider({ children }: PropsWithChildren): JSX.Element {
  const [config, setConfig] = useState<RuntimeConfig>(() => resolveRuntimeConfig());
  const token = config.token;
  const baseUrl = config.baseUrl;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handler = (event: Event) => {
      const detail =
        event instanceof CustomEvent && event.detail && typeof event.detail === 'object'
          ? (event.detail as RuntimeEnvDetail)
          : undefined;
      setConfig((previous) => {
        const next = resolveRuntimeConfig(detail);
        if (previous.token === next.token && previous.baseUrl === next.baseUrl) {
          return previous;
        }
        return next;
      });
    };

    window.addEventListener(RUNTIME_ENV_EVENT, handler);
    return () => {
      window.removeEventListener(RUNTIME_ENV_EVENT, handler);
    };
  }, []);

  const shouldInit = typeof window !== 'undefined' && !!token;
  const [client, setClient] = useState<StytchUIClient | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldInit) {
      setClient(null);
      setError(null);
      return;
    }

    let cancelled = false;
    let instance: StytchUIClient | null = null;
    try {
      instance = new StytchUIClient(token!, baseUrl ? { customBaseUrl: baseUrl } : undefined);
      if (!cancelled) {
        setClient(instance);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to initialize Stytch UI client', err);
      if (!cancelled) {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        let derivedMessage = 'Unable to connect to Stytch right now.';

        const messageFromError = (() => {
          if (err && typeof err === 'object') {
            const withMessage = err as { message?: unknown };
            if (typeof withMessage.message === 'string') {
              return withMessage.message;
            }
          }
          if (typeof err === 'string') {
            return err;
          }
          return '';
        })();

        if (typeof messageFromError === 'string' && messageFromError.length > 0) {
          derivedMessage = messageFromError;
        }

        setClient(null);
        setError(derivedMessage);
      }
    }

    return () => {
      cancelled = true;
      // Consumer UI client does not expose a destroy API; nothing to clean up.
    };
  }, [baseUrl, shouldInit, token]);

  const isReady = shouldInit && !!client;

  return (
    <StytchErrorContext.Provider value={error}>
      <StytchReadyContext.Provider value={isReady}>
        {!isReady || !client ? (
          <>
            {error ? (
              <div style={{ color: '#f87171', padding: '1rem', textAlign: 'center' }}>{error}</div>
            ) : null}
            {children}
          </>
        ) : (
          <StytchReactProvider stytch={client}>{children}</StytchReactProvider>
        )}
      </StytchReadyContext.Provider>
    </StytchErrorContext.Provider>
  );
}
