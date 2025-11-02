import { Head } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';

import { WORKER_ORIGIN, WorkerLink, workerUrl } from './_components/RouteRedirect';

export default function LoginScreen() {
  const params = useLocalSearchParams<{ status?: string }>();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [emailHint, setEmailHint] = useState('');
  const [locatorInfo, setLocatorInfo] = useState<{ explicit: boolean; derivedSlug: string | null } | null>(null);

  const loginUrl = useMemo(() => workerUrl('/login'), []);
  const webLoginUrl = useMemo(() => {
    const trimmed = emailHint.trim();
    if (!trimmed) return loginUrl;
    const url = new URL(loginUrl);
    url.searchParams.set('email', trimmed);
    return url.toString();
  }, [emailHint, loginUrl]);
  const hasWorkerConfigured = Boolean(WORKER_ORIGIN);
  const loginStatus = params.status;
  const hasJustReturned = loginStatus === 'success';

  const handleNativeRedirect = useCallback(() => {
    setIsRedirecting(true);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = loginUrl;
      return;
    }
    Linking.openURL(loginUrl).catch((error) => {
      console.warn('Failed to launch login URL', error);
      setIsRedirecting(false);
    });
  }, [loginUrl]);

  const handleDocsPress = useCallback(() => {
    const docsUrl = '/docs/SSO.md';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(docsUrl, '_blank', 'noopener');
    } else {
      Linking.openURL(docsUrl).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return undefined;
    }
    let cancelled = false;
    const controller = new AbortController();
    fetch(workerUrl('/api/debug/login-url'), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          explicit_locator?: boolean;
          derived_slug?: string | null;
        };
      })
      .then((data) => {
        if (cancelled || !data) return;
        setLocatorInfo({
          explicit: Boolean(data.explicit_locator),
          derivedSlug: data.derived_slug ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLocatorInfo(null);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

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
          content="Authenticate with Stytch to access the justevery starter stack dashboard."
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
          Authentication is handled by the Cloudflare Worker. When you continue, you will be redirected to the
          hosted Stytch login experience configured for this project.
        </Text>

        {hasJustReturned ? (
          <Text style={{ color: '#4ade80' }}>
            ✅ Signed in successfully. You can close this tab or head back to the app shell to continue.
          </Text>
        ) : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <WorkerLink path="/login" label={isRedirecting ? 'Redirecting…' : 'Continue to Stytch'} />
          <WorkerLink path="/app" label="Back to app" variant="secondary" />
        </View>

        {Platform.OS === 'web' && locatorInfo && !locatorInfo.explicit ? (
          <View
            style={{
              backgroundColor: 'rgba(190, 24, 93, 0.12)',
              borderColor: 'rgba(190, 24, 93, 0.45)',
              borderWidth: 1,
              borderRadius: 16,
              padding: 16,
              gap: 8,
            }}
          >
            <Text style={{ color: '#f472b6', fontWeight: '600' }}>SSO locator not configured</Text>
            <Text style={{ color: '#fbcfe8', fontSize: 13, lineHeight: 18 }}>
              The worker is sending Stytch the derived slug '{locatorInfo.derivedSlug ?? 'unknown'}'. Configure a
              connection or organization locator so hosted login resolves correctly.
            </Text>
            <Text
              onPress={handleDocsPress}
              style={{ color: '#f9a8d4', textDecorationLine: 'underline', fontWeight: '600', fontSize: 13 }}
            >
              View SSO setup guide
            </Text>
          </View>
        ) : null}

        {Platform.OS === 'web' ? (
          <View style={{
            gap: 12,
            padding: 16,
            backgroundColor: 'rgba(30, 41, 59, 0.6)',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: 'rgba(56, 189, 248, 0.3)',
          }}>
            <Text style={{ color: '#bae6fd', fontWeight: '600' }}>Need a hint?</Text>
            <Text style={{ color: '#94a3b8', fontSize: 13 }}>
              Provide a work email so Stytch can route you to the right SSO connection. If you leave this blank,
              we’ll still redirect you normally.
            </Text>
            <TextInput
              value={emailHint}
              onChangeText={setEmailHint}
              placeholder="name@example.com"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              style={{
                backgroundColor: '#0f172a',
                borderColor: 'rgba(14, 165, 233, 0.4)',
                borderWidth: 1,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 12,
                color: '#e2e8f0',
              }}
            />
            <TouchableOpacity
              onPress={() => {
                if (typeof window !== 'undefined') {
                  window.location.href = webLoginUrl;
                }
              }}
              style={{
                backgroundColor: '#38bdf8',
                paddingVertical: 10,
                paddingHorizontal: 18,
                borderRadius: 12,
                alignSelf: 'flex-start',
              }}
            >
              <Text style={{ color: '#0f172a', fontWeight: '600' }}>Continue with email hint</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!hasWorkerConfigured ? (
          <View style={{
            backgroundColor: 'rgba(148, 163, 184, 0.1)',
            borderRadius: 16,
            padding: 16,
            gap: 8,
          }}>
            <Text style={{ color: '#f97316', fontWeight: '600' }}>No Worker origin configured</Text>
            <Text style={{ color: '#e2e8f0', lineHeight: 20 }}>
              Set <Text style={{ fontWeight: '700' }}>EXPO_PUBLIC_WORKER_ORIGIN</Text> in your `.env` or `.env.local`
              file so native clients can launch the hosted login screen automatically.
            </Text>
            <Text
              onPress={handleNativeRedirect}
              style={{
                color: '#38bdf8',
                textDecorationLine: 'underline',
                alignSelf: 'flex-start',
                marginTop: 4,
              }}
            >
              Open login URL manually
            </Text>
          </View>
        ) : null}

        <Text style={{ color: '#94a3b8', fontSize: 12 }}>
          Redirect URL:{' '}
          <Text style={{ color: '#cbd5f5' }}>{loginUrl}</Text>
        </Text>
      </View>
    </ScrollView>
  );
}
