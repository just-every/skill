import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { Component, PropsWithChildren, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, DevSettings, Pressable, Text, View } from 'react-native';
import Constants from 'expo-constants';

import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import Layout from './src/components/Layout';
import { clearErrorLog, copyErrorLogToClipboard, getLogPath, logError, useGlobalErrorLogging } from './src/debug/errorLogging';
import { useCodeBridge, sendBridgeError } from './src/debug/codeBridge';
import { Callback, Contact, Dashboard, DevSidebarSandbox, Home, Pricing } from './src/pages';
import { RouterProvider, useRouterContext } from './src/router/RouterProvider';
import { usePublicEnv } from './src/runtimeEnv';

const RoutedView = () => {
  const { path } = useRouterContext();

  if (path.startsWith('/callback')) {
    return <Callback />;
  }

  if (path.startsWith('/dev/sidebar')) {
    return <DevSidebarSandbox />;
  }

  if (path.startsWith('/app')) {
    return <Dashboard />;
  }

  const content = (() => {
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

class RootErrorBoundary extends Component<
  PropsWithChildren,
  { hasError: boolean; error?: Error | null }
> {
  constructor(props: PropsWithChildren) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logError(error, 'root-error-boundary');
    sendBridgeError(error, 'root-error-boundary');
    console.error('Unhandled error in root boundary', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <StatusScreen
          title="Something went wrong"
          message="The web app hit an unexpected error."
          detail={this.state.error?.message}
          actionLabel="Reload"
          onAction={() => {
            try {
              if (typeof window !== 'undefined' && window?.location?.reload) {
                window.location.reload();
                return;
              }
              if (DevSettings?.reload) {
                DevSettings.reload();
                return;
              }
            } catch (reloadError) {
              logError(reloadError, 'reload-handler');
            }
          }}
        />
      );
    }
    return this.props.children;
  }
}

const App = (): ReactNode => {
  useGlobalErrorLogging();
  useCodeBridge();

  const env = usePublicEnv();

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const nextTitle = Constants.expoConfig?.name;
    if (nextTitle && document.title !== nextTitle) {
      document.title = nextTitle;
    }
  }, []);

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
    <RootErrorBoundary>
      <QueryClientProvider client={queryClientRef.current}>
        <EnvGate env={env}>
          <AuthProvider
            loginOrigin={env.loginOrigin}
            betterAuthBaseUrl={env.betterAuthBaseUrl}
            sessionEndpoint={env.sessionEndpoint}
            workerOrigin={env.workerOrigin}
            workerOriginLocal={env.workerOriginLocal}
          >
            <AuthStatusGate>
              <RouterProvider>
                <RoutedView />
              </RouterProvider>
            </AuthStatusGate>
          </AuthProvider>
        </EnvGate>
      </QueryClientProvider>
    </RootErrorBoundary>
  );
};

export default App;

const EnvGate = ({ env, children }: { env: ReturnType<typeof usePublicEnv>; children: ReactNode }) => {
  const envReady = useMemo(() => {
    return Boolean(env.loginOrigin && env.betterAuthBaseUrl && env.sessionEndpoint);
  }, [env]);

  useEffect(() => {
    console.info('[env]', env);
  }, [env]);

  if (!envReady) {
    return (
      <StatusScreen
        title="Configuring environment"
        message="Waiting for runtime configuration from the worker…"
        detail={`loginOrigin=${env.loginOrigin ?? 'missing'}`}
      />
    );
  }

  return <>{children}</>;
};

const AuthStatusGate = ({ children }: PropsWithChildren) => {
  const { status, openHostedLogin, authError } = useAuth();

  useEffect(() => {
    console.info('[auth status]', status, authError);
  }, [status, authError]);

  if (status === 'checking') {
    return (
      <StatusScreen
        title="Checking your session"
        message="Hang tight while we verify your credentials."
      />
    );
  }

  if (status === 'error') {
    return (
      <StatusScreen
        title="Unable to verify session"
        message="We could not reach the login service."
        detail={authError ?? 'Unknown error'}
        actionLabel="Retry login"
        onAction={() => openHostedLogin({ returnPath: '/app/overview', showProfilePopup: false })}
      />
    );
  }

  return <>{children}</>;
};

const StatusScreen = ({
  title,
  message,
  detail,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  detail?: string | null;
  actionLabel?: string;
  onAction?: () => void;
}) => {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-surface px-6 py-12">
      <ActivityIndicator size="large" color="#0f172a" />
      <View className="max-w-[420px] items-center gap-2">
        <Text className="text-2xl font-bold text-ink text-center">{title}</Text>
        <Text className="text-sm text-slate-500 text-center">{message}</Text>
        {detail ? (
          <Text className="text-xs text-slate-400 text-center">{detail}</Text>
        ) : null}
      </View>
      {onAction ? (
        <Pressable
          accessibilityRole="button"
          className="rounded-2xl bg-ink px-6 py-3"
          onPress={onAction}
        >
          <Text className="text-center text-sm font-semibold text-white">
            {actionLabel ?? 'Retry'}
          </Text>
        </Pressable>
      ) : null}
      {__DEV__ ? <DebugLogActions /> : null}
    </View>
  );
};

const DebugLogActions = () => {
  const [status, setStatus] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleCopy = async () => {
    const content = await copyErrorLogToClipboard();
    if (mountedRef.current) {
      setStatus(`Copied ${content.length} chars to clipboard`);
    }
  };

  const handleClear = async () => {
    await clearErrorLog();
    if (mountedRef.current) {
      setStatus('Cleared log file');
    }
  };

  return (
    <View className="items-center gap-2">
      <Text className="text-[10px] text-slate-400">Log file: {getLogPath()}</Text>
      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          className="rounded-xl bg-slate-800 px-4 py-2"
          onPress={handleCopy}
        >
          <Text className="text-xs font-semibold text-white">Copy error log</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          className="rounded-xl bg-slate-700 px-4 py-2"
          onPress={handleClear}
        >
          <Text className="text-xs font-semibold text-white">Clear log</Text>
        </Pressable>
      </View>
      {status ? <Text className="text-[10px] text-slate-400">{status}</Text> : null}
    </View>
  );
};
