import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LogtoProvider as SDKLogtoProvider, type LogtoConfig } from '@logto/react';

const RUNTIME_EVENT = 'justevery:env-ready';

type RuntimeEnv = Partial<{
  logtoEndpoint: string;
  logtoAppId: string;
  apiResource: string;
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

function normalise(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readRuntimeEnv(): RuntimeEnv {
  try {
    return ((globalThis as GlobalWithRuntime).__JUSTEVERY_ENV__ ?? {}) satisfies RuntimeEnv;
  } catch {
    return {};
  }
}

function buildLogtoConfig(detail: RuntimeEnv | undefined): LogtoConfig | null {
  const injected = readRuntimeEnv();
  const processEnv = readProcessEnv() ?? {};

  const endpoint = normalise(detail?.logtoEndpoint) ?? normalise(injected.logtoEndpoint) ?? normalise(processEnv.EXPO_PUBLIC_LOGTO_ENDPOINT);
  const appId = normalise(detail?.logtoAppId) ?? normalise(injected.logtoAppId) ?? normalise(processEnv.EXPO_PUBLIC_LOGTO_APP_ID);
  const apiResource = normalise(detail?.apiResource) ?? normalise(injected.apiResource) ?? normalise(processEnv.EXPO_PUBLIC_API_RESOURCE);

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
    // Some versions of the Logto React SDK also honour the singular `resource` field.
    (config as LogtoConfig & { resource?: string }).resource = apiResource;
  }

  return config;
}

export default function LogtoProvider({ children }: { children: ReactNode }): JSX.Element {
  const [config, setConfig] = useState<LogtoConfig | null>(() => buildLogtoConfig(undefined));
  const [error, setError] = useState<Error | null>(null);
  const [initialised, setInitialised] = useState<boolean>(config !== null);

  useEffect(() => {
    let mounted = true;

    const initialise = (detail: RuntimeEnv | undefined) => {
      try {
        const next = buildLogtoConfig(detail);
        if (!next) {
          if (detail) {
            throw new Error('Missing Logto configuration (endpoint or appId)');
          }
          return;
        }
        if (!mounted) {
          return;
        }
        setConfig((previous) => {
          if (previous && previous.endpoint === next.endpoint && previous.appId === next.appId) {
            const previousResource = previous.resources?.[0];
            const nextResource = next.resources?.[0];
            if (previousResource === nextResource) {
              return previous;
            }
          }
          return next;
        });
        setError(null);
      } catch (err) {
        if (!mounted) {
          return;
        }
        setError(err instanceof Error ? err : new Error('Failed to initialise Logto'));
        setConfig(null);
      }
      setInitialised(true);
    };

    initialise(undefined);

    if (typeof window !== 'undefined') {
      const current = (window as GlobalWithRuntime).__JUSTEVERY_ENV__;
      if (current) {
        initialise(current);
      }
    }

    if (typeof window === 'undefined') {
      return () => {
        mounted = false;
      };
    }

    const handler = (event: Event) => {
      const detail = event instanceof CustomEvent ? (event.detail as RuntimeEnv | undefined) : undefined;
      initialise(detail);
    };

    window.addEventListener(RUNTIME_EVENT, handler);
    return () => {
      window.removeEventListener(RUNTIME_EVENT, handler);
      mounted = false;
    };
  }, []);

  const isReady = useMemo(() => initialised && config !== null, [config, initialised]);

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
