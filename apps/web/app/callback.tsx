import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useHandleSignInCallback } from '@logto/react';

import { useLogtoReady } from './_providers/LogtoProvider';

export default function CallbackScreen(): JSX.Element {
  const router = useRouter();
  const isReady = useLogtoReady();
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
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a', gap: 12 }}>
      <ActivityIndicator size="large" color="#38bdf8" />
      <Text style={{ color: '#e2e8f0' }}>
        {!isReady || isLoading ? 'Completing sign-in…' : 'Redirecting...'}
      </Text>
      {error ? <Text style={{ color: '#f87171' }}>{error.message}</Text> : null}
    </View>
  );
}
