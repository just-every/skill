import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLogto } from '@logto/react';

import { LOGTO_POST_LOGOUT_REDIRECT_URI } from './_components/RouteRedirect';
import { useLogtoReady } from './_providers/LogtoProvider';

export default function LogoutScreen(): JSX.Element {
  const router = useRouter();
  const isReady = useLogtoReady();
  const { signOut, isAuthenticated } = useLogto();

  useEffect(() => {
    if (!isReady) {
      return;
    }

    async function run() {
      try {
        if (isAuthenticated) {
          const redirectUri =
            LOGTO_POST_LOGOUT_REDIRECT_URI || (typeof window !== 'undefined' ? window.location.origin : '/');
          await signOut(redirectUri);
        } else {
          router.replace('/');
        }
      } catch (error) {
        console.error('Logto sign-out failed', error);
        router.replace('/');
      }
    }

    void run();
  }, [isAuthenticated, isReady, router, signOut]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a', gap: 12 }}>
      <ActivityIndicator size="large" color="#38bdf8" />
      <Text style={{ color: '#e2e8f0' }}>Signing you out…</Text>
    </View>
  );
}
