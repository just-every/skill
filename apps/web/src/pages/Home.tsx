import React, { useCallback } from 'react';
import { Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { useAuthConfig } from '../auth/AuthConfig';
import { useLogto } from '../auth/LogtoProvider';
import { usePublicEnv } from '../runtimeEnv';
import { useRouterContext } from '../router/RouterProvider';

const heroFeatures = [
  {
    title: 'Worker-first architecture',
    description:
      'Ship a Cloudflare Worker, D1, and R2 baseline out of the box. Deployments promote both the API and static assets together.'
  },
  {
    title: 'Logto authentication',
    description:
      'Client flows use the Logto React Native SDK while the Worker validates bearer tokens before returning data.'
  },
  {
    title: 'Stripe billing hooks',
    description:
      'Preview pricing tiers locally, then sync real products and webhook endpoints with a single bootstrap command.'
  }
];

const Home = () => {
  const env = usePublicEnv();
  const { navigate } = useRouterContext();
  const authConfig = useAuthConfig();
  const { isAuthenticated, signIn } = useLogto();

  const workerOrigin = env.workerOrigin ?? env.workerOriginLocal;
  const heroImage = workerOrigin ? `${workerOrigin.replace(/\/$/, '')}/marketing/hero.png` : undefined;

  const handleOpenDashboard = useCallback(async () => {
    if (isAuthenticated) {
      navigate('/app');
      return;
    }

    const redirectTarget = Platform.OS === 'web'
      ? authConfig.redirectUriProd ?? authConfig.redirectUri
      : authConfig.redirectUriLocal ?? authConfig.redirectUri;

    const fallbackRedirect = redirectTarget ?? authConfig.redirectUri;

    try {
      await Promise.resolve(signIn(fallbackRedirect));
    } catch (error) {
      console.warn('Failed to start sign-in from home CTA', error);
    }
  }, [authConfig.redirectUri, authConfig.redirectUriLocal, authConfig.redirectUriProd, isAuthenticated, navigate, signIn]);

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, gap: 32 }}>
      <View
        style={{
          backgroundColor: '#0f172a',
          borderRadius: 32,
          padding: 32,
          gap: 24,
          borderWidth: 1,
          borderColor: 'rgba(56, 189, 248, 0.25)'
        }}
      >
        <View style={{ gap: 12 }}>
          <Text style={{ color: '#38bdf8', textTransform: 'uppercase', letterSpacing: 4 }}>justevery</Text>
          <Text style={{ color: '#e2e8f0', fontSize: 36, fontWeight: '700', lineHeight: 42 }}>
            Launch front door, auth, and billing on day one.
          </Text>
          <Text style={{ color: '#cbd5f5', fontSize: 16, lineHeight: 24 }}>
            Scaffold a Cloudflare-native SaaS starter complete with Worker APIs, Logto authentication, and Stripe
            ready-to-test pricing journeys.
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <Pressable
            onPress={() => void handleOpenDashboard()}
            style={{
              backgroundColor: '#38bdf8',
              borderRadius: 12,
              paddingVertical: 14,
              paddingHorizontal: 22
            }}
          >
            <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 16 }}>Open dashboard</Text>
          </Pressable>
          <Pressable
            onPress={() => navigate('/pricing')}
            style={{
              borderRadius: 12,
              paddingVertical: 14,
              paddingHorizontal: 22,
              borderWidth: 1,
              borderColor: 'rgba(148, 163, 184, 0.5)'
            }}
          >
            <Text style={{ color: '#e2e8f0', fontWeight: '600', fontSize: 16 }}>Preview pricing</Text>
          </Pressable>
        </View>

        {Platform.OS === 'web' ? (
          heroImage ? (
            <Image
              source={{ uri: heroImage }}
              resizeMode="cover"
              style={{
                width: '100%',
                maxWidth: 720,
                height: 320,
                borderRadius: 24,
                borderWidth: 1,
                borderColor: 'rgba(56,189,248,0.35)',
                backgroundColor: 'rgba(15,23,42,0.6)'
              }}
            />
          ) : (
            <View
              style={{
                width: '100%',
                maxWidth: 720,
                height: 320,
                borderRadius: 24,
                borderWidth: 1,
                borderColor: 'rgba(148,163,184,0.25)',
                backgroundColor: 'rgba(15,23,42,0.4)',
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 24
              }}
            >
              <Text style={{ color: '#94a3b8', textAlign: 'center' }}>
                Upload `marketing/hero.png` to your Worker assets bucket or configure `EXPO_PUBLIC_WORKER_ORIGIN` to
                preview the marketing hero locally.
              </Text>
            </View>
          )
        ) : null}
      </View>

      <View style={{ gap: 24 }}>
        <Text style={{ color: '#0f172a', fontSize: 24, fontWeight: '700' }}>What’s in the starter</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          {heroFeatures.map((feature) => (
            <View
              key={feature.title}
              style={{
                flexBasis: '31%',
                minWidth: 240,
                flexGrow: 1,
                backgroundColor: '#ffffff',
                borderRadius: 20,
                padding: 24,
                gap: 8,
                borderWidth: 1,
                borderColor: '#e2e8f0'
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#0f172a' }}>{feature.title}</Text>
              <Text style={{ color: '#475569', lineHeight: 20 }}>{feature.description}</Text>
            </View>
          ))}
        </View>
        <Text style={{ color: '#64748b', fontSize: 13 }}>
          Need a guided tour? Jump into the dashboard to exercise Logto-protected Worker APIs, or open the docs folder
          for infra walkthroughs.
        </Text>
      </View>
    </ScrollView>
  );
};

export default Home;
