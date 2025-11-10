import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { ReactNode, useRef } from 'react';

import './global.css';

import { AuthProvider } from './src/auth/AuthProvider';
import Layout from './src/components/Layout';
import { Callback, Contact, Dashboard, Home, Pricing } from './src/pages';
import { RouterProvider, useRouterContext } from './src/router/RouterProvider';
import { usePublicEnv } from './src/runtimeEnv';

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

const App = (): ReactNode => {
  const env = usePublicEnv();
  const queryClientRef = useRef<QueryClient>();

  if (!queryClientRef.current) {
    queryClientRef.current = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          refetchOnWindowFocus: false,
          retry: 1,
        },
      },
    });
  }

  return (
    <QueryClientProvider client={queryClientRef.current}>
      <AuthProvider
        loginOrigin={env.loginOrigin}
        betterAuthBaseUrl={env.betterAuthBaseUrl}
        sessionEndpoint={env.sessionEndpoint}
      >
        <RouterProvider>
          <RoutedView />
        </RouterProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
