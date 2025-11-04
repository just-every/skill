import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LogtoProvider as SDKLogtoProvider, type LogtoConfig } from '@logto/react';

const RUNTIME_EVENT = 'justevery:env-ready';

type RuntimeEnv = Partial<{
  logtoEndpoint: string;
  logtoAppId: string;
  logtoApiResource: string;
  logtoPostLogoutRedirectUri: string;
}>;

type GlobalWithRuntime = typeof globalThis & {
  __JUSTEVERY_ENV__?: RuntimeEnv;
};

type EnvGetter = Record<string, string | undefined> | undefined;

const LogtoReadyContext = createContext<boolean>(false);
const LogtoErrorContext = createContext<Error | null>(null);

export function useLogtoReady(): boolean {
  return useContext(LogtoReadyContext);
}

export function useLogtoError(): Error | null {
  return useContext(LogtoErrorContext);
}

function readProcessEnv(): EnvGetter {
  try {
    return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  } catch {
    return undefined;
  }
}

function buildLogtoConfig(detail: RuntimeEnv | undefined): LogtoConfig | null {
  const injected = (globalThis as GlobalWithRuntime).__JUSTEVERY_ENV__ ?? {};
  const processEnv = readProcessEnv() ?? {};

  const endpoint = detail?.logtoEndpoint ?? injected.logtoEndpoint ?? processEnv.EXPO_PUBLIC_LOGTO_ENDPOINT;
  const appId = detail?.logtoAppId ?? injected.logtoAppId ?? processEnv.EXPO_PUBLIC_LOGTO_APP_ID;
  const apiResource = detail?.logtoApiResource ?? injected.logtoApiResource ?? processEnv.EXPO_PUBLIC_API_RESOURCE;

  if (!endpoint || !appId) {
    return null;
  }

  const config: LogtoConfig = {
    endpoint,
    appId,
    scopes: ['openid', 'profile', 'email'],
  };

  if (apiResource) {
    config.resources = [apiResource];
  }

  return config;
}

export default function LogtoProvider({ children }: { children: ReactNode }): JSX.Element {
  const [config, setConfig] = useState<LogtoConfig | null>(() => buildLogtoConfig(undefined));
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const initialise = (detail: RuntimeEnv | undefined) => {
      try {
        const next = buildLogtoConfig(detail);
        if (!next) {
          throw new Error('Missing Logto configuration (endpoint or appId)');
        }
        setConfig((previous) => {
          if (previous && JSON.stringify(previous) === JSON.stringify(next)) {
            return previous;
          }
          return next;
        });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to initialise Logto'));
        setConfig(null);
      }
    };

    initialise(undefined);

    if (typeof window === 'undefined') {
      return undefined;
    }

    const handler = (event: Event) => {
      const detail = event instanceof CustomEvent ? (event.detail as RuntimeEnv | undefined) : undefined;
      initialise(detail);
    };

    window.addEventListener(RUNTIME_EVENT, handler);
    return () => {
      window.removeEventListener(RUNTIME_EVENT, handler);
    };
  }, []);

  const isReady = useMemo(() => config !== null, [config]);

  const provider = isReady && config ? (
    <SDKLogtoProvider config={config}>{children}</SDKLogtoProvider>
  ) : (
    children
  );

  return (
    <LogtoReadyContext.Provider value={isReady}>
      <LogtoErrorContext.Provider value={error}>{provider}</LogtoErrorContext.Provider>
    </LogtoReadyContext.Provider>
  );
}
