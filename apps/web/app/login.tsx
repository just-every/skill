import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { StytchLogin, useStytch, useStytchSession } from '@stytch/react';

import { useStytchError, useStytchReady } from './_providers/StytchProvider';

export default function LoginScreen(): JSX.Element {
  const ready = useStytchReady();

  if (!ready) {
    return <LoginLoading />;
  }

  return <LoginReady />;
}

function LoginReady(): JSX.Element {
  const router = useRouter();
  const stytch = useStytch();
  const sessionState = useStytchSession();

  const redirectUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return '/app';
    }
    return `${window.location.origin}/app`;
  }, []);

  useEffect(() => {
    const tokens = stytch.session.getTokens();
    if (tokens?.session_jwt) {
      router.replace('/app');
    }
  }, [router, stytch]);

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
          content="Sign in with the Stytch prebuilt UI to access the justevery starter stack dashboard."
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
        <Text style={{ color: '#e2e8f0', fontSize: 28, fontWeight: '700' }}>Sign in with Stytch</Text>
        <Text style={{ color: '#cbd5f5', lineHeight: 22 }}>
          The web client embeds the Stytch prebuilt login so you can complete the flow without leaving the app shell.
        </Text>

        <View style={{ padding: 16, borderRadius: 16, backgroundColor: 'rgba(30, 41, 59, 0.6)' }}>
          <StytchLogin
            config={{
              products: ['emailMagicLinks'],
              emailMagicLinksOptions: {
                loginRedirectUrl: redirectUrl,
                signupRedirectUrl: redirectUrl,
              },
            }}
          />
        </View>

        <Text style={{ color: '#94a3b8', fontSize: 12 }}>
          Sessions stay on the client. Worker requests send the Stytch session JWT as a bearer token for verification.
        </Text>
      </View>
    </ScrollView>
  );
}

function LoginLoading(): JSX.Element {
  const error = useStytchError();

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
          <Text style={{ color: '#f87171', textAlign: 'center' }}>{error}</Text>
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
