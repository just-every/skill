import React, { useCallback } from 'react';
import { Image, Platform, View } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { usePublicEnv } from '../runtimeEnv';
import { useRouterContext } from '../router/RouterProvider';
import { Button, Card, CardContent, CardHeader } from '../components/ui';
import { Typography } from '../components/Typography';

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
    <View className="flex flex-col gap-10 py-10">
      <Card className="border-transparent bg-gradient-to-br from-ink via-ink to-brand-900 shadow-card">
        <CardHeader className="space-y-3">
          <Typography variant="eyebrow" className="text-accent">
            justevery
          </Typography>
          <Typography variant="h1" className="text-white">
            Launch front door, auth, and billing on day one.
          </Typography>
          <Typography variant="body" className="text-white/80 max-w-2xl">
            Scaffold a Cloudflare-native SaaS starter complete with Worker APIs, Better Auth-managed login, and Stripe-ready pricing journeys.
          </Typography>
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
                <Typography variant="body" className="text-center text-slate-200">
                  Upload `marketing/hero.png` to your Worker assets bucket or configure `EXPO_PUBLIC_WORKER_ORIGIN` to preview the marketing hero locally.
                </Typography>
              </View>
            )
          ) : null}
        </CardContent>
      </Card>

      <View className="flex flex-col gap-6">
        <Typography variant="h2">
          What’s in the starter
        </Typography>
        <View className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {heroFeatures.map((feature) => (
            <Card key={feature.title} className="h-full min-h-[220px]">
              <CardContent className="gap-3">
                <Typography variant="h3">{feature.title}</Typography>
                <Typography variant="bodySmall">{feature.description}</Typography>
              </CardContent>
            </Card>
          ))}
        </View>
        <Typography variant="caption" className="text-slate-500">
          Need a guided tour? Jump into the dashboard to exercise Better Auth-protected Worker APIs, or open the docs folder for infra walkthroughs.
        </Typography>
      </View>
    </View>
  );
};

export default Home;
