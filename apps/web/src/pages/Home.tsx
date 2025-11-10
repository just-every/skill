import React, { useCallback } from 'react';
import { Image, Platform, ScrollView, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { usePublicEnv } from '../runtimeEnv';
import { useRouterContext } from '../router/RouterProvider';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui';

const heroFeatures = [
  {
    title: 'Worker-first architecture',
    description: 'Ship Cloudflare Workers, D1, and R2 together. Deployments promote both the API and static assets.',
  },
  {
    title: 'Better Auth login worker',
    description:
      'Marketing and dashboard flows call the Better Auth worker over HTTPS or jump directly into the hosted UI.',
  },
  {
    title: 'Stripe billing hooks',
    description: 'Preview pricing tiers locally, then sync live products and webhook endpoints with one bootstrap command.',
  },
];

const Home = () => {
  const env = usePublicEnv();
  const { navigate } = useRouterContext();
  const { isAuthenticated, openHostedLogin } = useAuth();

  const workerOrigin = env.workerOrigin ?? env.workerOriginLocal;
  const heroImage = workerOrigin ? `${workerOrigin.replace(/\/$/, '')}/marketing/hero.png` : undefined;

  const handleOpenDashboard = useCallback(() => {
    if (isAuthenticated) {
      navigate('/app');
      return;
    }
    openHostedLogin({ returnPath: '/app/overview' });
  }, [isAuthenticated, navigate, openHostedLogin]);

  return (
    <ScrollView className="flex-1 bg-surface px-4 py-8">
      <View className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <Card className="border-transparent bg-gradient-to-br from-ink via-ink to-brand-900 shadow-card">
          <CardHeader>
            <Text className="text-xs uppercase tracking-[0.4em] text-accent">justevery</Text>
            <CardTitle className="text-4xl text-white">
              Launch front door, auth, and billing on day one.
            </CardTitle>
            <CardDescription className="text-slate-200">
              Scaffold a Cloudflare-native SaaS starter complete with Worker APIs, Better Auth-managed login, and Stripe-ready pricing journeys.
            </CardDescription>
          </CardHeader>

          <CardContent className="gap-4">
            <View className="flex-row flex-wrap gap-3">
              <Button onPress={() => void handleOpenDashboard()}>Open dashboard</Button>
              <Button variant="ghost" onPress={() => navigate('/pricing')}>
                Preview pricing
              </Button>
            </View>

            {Platform.OS === 'web' ? (
              heroImage ? (
                <Image
                  source={{ uri: heroImage }}
                  resizeMode="cover"
                  className="h-80 w-full rounded-3xl border border-white/20"
                />
              ) : (
                <View className="w-full items-center justify-center rounded-3xl border border-white/20 bg-white/10 p-6">
                  <Text className="text-center text-slate-200">
                    Upload `marketing/hero.png` to your Worker assets bucket or configure `EXPO_PUBLIC_WORKER_ORIGIN` to preview the marketing hero locally.
                  </Text>
                </View>
              )
            ) : null}
          </CardContent>
        </Card>

        <View className="mt-10 gap-6">
          <Text className="text-2xl font-bold text-ink">What’s in the starter</Text>
          <View className="flex-row flex-wrap gap-4">
            {heroFeatures.map((feature) => (
              <Card key={feature.title} className="flex-1 min-w-[220px]">
                <CardContent className="gap-2">
                  <Text className="text-lg font-semibold text-ink">{feature.title}</Text>
                  <Text className="text-sm leading-5 text-slate-500">{feature.description}</Text>
                </CardContent>
              </Card>
            ))}
          </View>
          <Text className="text-xs uppercase tracking-[0.4em] text-slate-500">
            Need a guided tour? Jump into the dashboard to exercise Better Auth-protected Worker APIs, or open the docs folder for infra walkthroughs.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

export default Home;
