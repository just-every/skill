import Head from 'expo-router/head';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import * as StytchB2B from '@stytch/react/dist/b2b/index.js';

export default function LoginScreen(): JSX.Element {
  const router = useRouter();
  const { StytchB2BLogin } = StytchB2B as { StytchB2BLogin: React.ComponentType<any> };
  const { session } = StytchB2B.useStytchMemberSession();

  const redirectUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return '/app';
    }
    return `${window.location.origin}/app`;
  }, []);

  useEffect(() => {
    if (session?.session_jwt) {
      router.replace('/app');
    }
  }, [router, session?.session_jwt]);

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
          content="Sign in with the Stytch React B2B SDK to access the justevery starter stack dashboard."
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
          The web client embeds the Stytch React B2B prebuilt login so you can complete the flow without leaving the app shell.
        </Text>

        <View style={{ padding: 16, borderRadius: 16, backgroundColor: 'rgba(30, 41, 59, 0.6)' }}>
          <StytchB2BLogin
            config={{
              email_magic_links_options: {
                login_redirect_url: redirectUrl,
                signup_redirect_url: redirectUrl,
              },
              oauth_options: {
                login_redirect_url: redirectUrl,
                signup_redirect_url: redirectUrl,
                providers: ['google', 'microsoft'],
              },
              sso_options: {
                default_redirect_url: redirectUrl,
                default_invite_redirect_url: redirectUrl,
              },
              session_options: {
                session_duration_minutes: 60,
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
