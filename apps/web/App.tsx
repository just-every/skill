import { LogtoConfig, UserScope } from '@logto/rn';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { ReactNode, useMemo, useRef } from 'react';
import { Text, View } from 'react-native';

import { usePublicEnv } from './src/runtimeEnv';
import Layout from './src/components/Layout';
import { Callback, Contact, Dashboard, Home, Pricing } from './src/pages';
import { RouterProvider, useRouterContext } from './src/router/RouterProvider';
import { AuthConfigProvider } from './src/auth/AuthConfig';
import { HybridLogtoProvider } from './src/auth/LogtoProvider';

type ConfigState =
  | {
      kind: 'ready';
      config: LogtoConfig;
      redirectUri: string;
      logoutRedirectUri?: string;
    }
  | { kind: 'error'; reasons: string[] };

const resolveRedirectUri = (env: ReturnType<typeof usePublicEnv>) => {
  if (env.redirectUri) {
    return env.redirectUri;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/callback`;
  }
  return env.redirectUriProd ?? 'justevery://callback';
};

const buildConfig = (env: ReturnType<typeof usePublicEnv>): ConfigState => {
  const missing: string[] = [];

  if (!env.logtoEndpoint) {
    missing.push('Missing EXPO_PUBLIC_LOGTO_ENDPOINT.');
  }

  if (!env.logtoAppId) {
    missing.push('Missing EXPO_PUBLIC_LOGTO_APP_ID.');
  }

  if (missing.length > 0) {
    return { kind: 'error', reasons: missing };
  }

  const scopes = env.scopes.length > 0 ? env.scopes : ['openid', 'offline_access', UserScope.Profile, UserScope.Email];
  const resources = env.resources.length > 0 ? env.resources : undefined;

  const config: LogtoConfig = {
    endpoint: env.logtoEndpoint!,
    appId: env.logtoAppId!,
    scopes,
    resources,
  };

  return {
    kind: 'ready',
    config,
    redirectUri: resolveRedirectUri(env),
    logoutRedirectUri: env.postLogoutRedirectUri,
  };
};

const RoutedView = () => {
  const { path } = useRouterContext();

  if (path === '/callback') {
    return <Callback />;
  }

  const content = (() => {
    if (path.startsWith('/app')) {
      return <Dashboard />;
    }
    switch (path) {
      case '/pricing':
        return <Pricing />;
      case '/contact':
        return <Contact />;
      case '/':
      default:
        return <Home />;
    }
  })();

  return <Layout>{content}</Layout>;
};

const ConfigError = ({ reasons }: { reasons: string[] }) => (
  <Layout>
    <View style={{ gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '700', color: '#0f172a' }}>Configuration required</Text>
      <Text style={{ fontSize: 16, color: '#475569' }}>
        Update your Expo environment variables to finish Logto setup.
      </Text>
      {reasons.map((reason) => (
        <Text key={reason} style={{ color: '#dc2626' }}>
          {reason}
        </Text>
      ))}
    </View>
  </Layout>
);

const App = (): ReactNode => {
  const env = usePublicEnv();
  const state = useMemo(() => buildConfig(env), [env]);
  const queryClientRef = useRef<QueryClient>();

  if (!queryClientRef.current) {
    queryClientRef.current = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          refetchOnWindowFocus: false,
          retry: 1
        }
      }
    });
  }

  const isLocalhost = typeof window !== 'undefined' && window.location.origin.includes('localhost');

  let content: ReactNode;

  if (state.kind === 'error' && isLocalhost) {
    content = (
      <Layout>
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: '600', color: '#0f172a' }}>Loading configuration…</Text>
          <Text style={{ fontSize: 16, color: '#475569' }}>
            Waiting for runtime environment variables from the Worker. This page will update automatically once they load.
          </Text>
        </View>
      </Layout>
    );
  } else if (state.kind === 'error') {
    content = <ConfigError reasons={state.reasons} />;
  } else {
    content = (
      <HybridLogtoProvider config={state.config}>
        <AuthConfigProvider
          value={{
            redirectUri: state.redirectUri,
            redirectUriLocal: env.redirectUriLocal,
            redirectUriProd: env.redirectUriProd,
            logoutRedirectUri: state.logoutRedirectUri
          }}
        >
          <RoutedView />
        </AuthConfigProvider>
      </HybridLogtoProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClientRef.current}>
      <RouterProvider>{content}</RouterProvider>
    </QueryClientProvider>
  );
};

export default App;
