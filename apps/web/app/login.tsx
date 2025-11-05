import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { useLogto } from '@logto/react';

import { useLogtoError, useLogtoReady } from './_providers/LogtoProvider';

export default function LoginScreen(): JSX.Element {
  const ready = useLogtoReady();

  if (!ready) {
    return <LoginLoading />;
  }

  return <LoginReady />;
}

function LoginReady(): JSX.Element {
  const router = useRouter();
  const { isAuthenticated, signIn } = useLogto();
  const logtoError = useLogtoError();

  const redirectUri = useMemo(() => {
    if (typeof window === 'undefined') {
      return '/callback';
    }
    return `${window.location.origin}/callback`;
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/app');
    }
  }, [isAuthenticated, router]);

  const handleSignIn = async () => {
    try {
      await signIn(redirectUri);
    } catch (error) {
      console.error('Logto sign-in failed', error);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        paddingVertical: 48,
        paddingHorizontal: 24,
        backgroundColor: '#0b1120',
      }}
    >
      <Head>
        <title>justevery • Sign in</title>
        <meta
          name="description"
          content="Sign in with Logto to access the justevery starter stack dashboard."
        />
      </Head>

      <View
        style={{
          maxWidth: 640,
          width: '100%',
          alignSelf: 'center',
          backgroundColor: 'rgba(15, 23, 42, 0.82)',
          borderRadius: 28,
          borderWidth: 1,
          borderColor: 'rgba(96, 165, 250, 0.35)',
          padding: 32,
          gap: 18,
        }}
      >
        <Text style={{ color: '#38bdf8', textTransform: 'uppercase', letterSpacing: 3 }}>Authentication</Text>
        <Text style={{ color: '#e2e8f0', fontSize: 28, fontWeight: '700' }}>Sign in with Logto</Text>
        <Text style={{ color: '#cbd5f5', lineHeight: 22 }}>
          Use your organisation email to sign in securely. We’ll redirect you back to the dashboard once Logto completes
          the flow.
        </Text>

        {logtoError ? (
          <View style={{ padding: 16, borderRadius: 12, backgroundColor: 'rgba(239, 68, 68, 0.16)', gap: 8 }}>
            <Text style={{ color: '#f87171', fontWeight: '600' }}>Logto configuration error</Text>
            <Text style={{ color: '#fecaca', fontSize: 12 }}>{logtoError.message}</Text>
          </View>
        ) : null}

        <View style={{ padding: 16, borderRadius: 16, backgroundColor: 'rgba(30, 41, 59, 0.6)', gap: 12 }}>
          <Pressable
            onPress={handleSignIn}
            style={{
              paddingHorizontal: 24,
              paddingVertical: 14,
              borderRadius: 12,
              backgroundColor: '#38bdf8',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#0f172a', fontWeight: '600', fontSize: 16 }}>Continue with Logto</Text>
          </Pressable>
          <Text style={{ color: '#94a3b8', fontSize: 12 }}>
            We’ll take you to Logto, then return here once you’re authenticated.
          </Text>
        </View>

        <Text style={{ color: '#94a3b8', fontSize: 12 }}>
          Sessions stay on the client. Worker requests send the Logto access token as a bearer for verification.
        </Text>
      </View>
    </ScrollView>
  );
}

function LoginLoading(): JSX.Element {
  const error = useLogtoError();

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        paddingVertical: 48,
        paddingHorizontal: 24,
        backgroundColor: '#0b1120',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Head>
        <title>justevery • Sign in</title>
      </Head>
      <View
        style={{
          gap: 12,
          alignItems: 'center',
          backgroundColor: 'rgba(15, 23, 42, 0.82)',
          borderRadius: 28,
          borderWidth: 1,
          borderColor: 'rgba(96, 165, 250, 0.35)',
          padding: 32,
          maxWidth: 640,
          width: '100%',
        }}
      >
        {error ? (
          <Text style={{ color: '#f87171', textAlign: 'center' }}>{error.message}</Text>
        ) : (
          <>
            <ActivityIndicator color="#38bdf8" />
            <Text style={{ color: '#cbd5f5' }}>Preparing secure sign-in…</Text>
          </>
        )}
      </View>
    </ScrollView>
  );
}
