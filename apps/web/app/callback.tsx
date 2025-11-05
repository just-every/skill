import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useHandleSignInCallback } from '@logto/react';

import { useLogtoError, useLogtoReady } from './_providers/LogtoProvider';

export default function CallbackScreen(): JSX.Element {
  const isReady = useLogtoReady();
  const providerError = useLogtoError();

  if (!isReady) {
    return (
      <CallbackState
        status="loading"
        message="Preparing Logto configuration…"
        error={providerError?.message}
      />
    );
  }

  return <CallbackReady providerError={providerError?.message} />;
}

function CallbackReady({ providerError }: { providerError?: string }): JSX.Element {
  const router = useRouter();
  const { isLoading, error } = useHandleSignInCallback(() => {
    router.replace('/app');
  });

  useEffect(() => {
    if (error) {
      console.error('Logto callback error', error);
      const timeout = setTimeout(() => {
        router.replace('/login');
      }, 2500);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [error, router]);

  return (
    <CallbackState
      status={isLoading ? 'loading' : 'success'}
      message={isLoading ? 'Completing sign-in…' : 'Redirecting...'}
      error={error?.message ?? providerError}
    />
  );
}

function CallbackState({
  status,
  message,
  error,
}: {
  status: 'loading' | 'success';
  message: string;
  error?: string;
}): JSX.Element {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a', gap: 12 }}>
      <ActivityIndicator size="large" color="#38bdf8" animating={status === 'loading'} />
      <Text style={{ color: '#e2e8f0' }}>{message}</Text>
      {error ? <Text style={{ color: '#f87171', maxWidth: 480, textAlign: 'center' }}>{error}</Text> : null}
    </View>
  );
}
