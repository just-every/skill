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

const integrationHighlights = [
  {
    title: 'Bootstrap CLI',
    description: 'Provision D1, R2, secrets, and Stripe webhooks in one typed command so staging stays in sync.',
  },
  {
    title: 'Better Auth',
    description: 'Drop-in hosted auth or call the LOGIN_SERVICE binding for worker-to-worker session validation.',
  },
  {
    title: 'Stripe Journeys',
    description: 'Seed Founders & Scale plans locally, then promote real products with predictable IDs.',
  },
];

const testimonial = {
  quote:
    '“We cloned the starter and shipped a billable preview of our product within a week — the Workers + Stripe wiring just worked.”',
  author: 'Jess Patel',
  role: 'Head of Engineering, Northwind Labs',
};

const heroStats = [
  { label: 'Bootstrap to deploy', value: '8 minutes' },
  { label: 'API & static bundles', value: '1 wrangler publish' },
  { label: 'Prebuilt flows', value: 'Login, billing, dashboard' },
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
    <View className="flex flex-col gap-14 py-10">
      <Card className="border-transparent bg-gradient-to-br from-ink via-ink to-brand-900 shadow-card">
        <CardHeader className="space-y-3">
          <View className="self-start rounded-full border border-white/20 bg-white/10 px-4 py-1">
            <Typography variant="caption" className="text-white/80">
              Built for Cloudflare + Stripe teams
            </Typography>
          </View>
          <Typography variant="eyebrow" className="text-accent">
            justevery
          </Typography>
          <Typography variant="h1" className="text-white">
            Launch front door, auth, and billing on day one.
          </Typography>
          <Typography variant="body" className="text-white/80 max-w-2xl">
            Scaffold a Cloudflare-native SaaS starter complete with Worker APIs, Better Auth-managed login, Stripe-ready pricing journeys,
            and now a single push-to-deploy flow that mirrors local prerenders exactly.
          </Typography>
        </CardHeader>

        <CardContent className="gap-8 pt-4">
          <View className="mt-2 flex-row flex-wrap gap-3">
            <Button onPress={() => void handleOpenDashboard()} className="shadow-lg shadow-brand-900/20">
              Open dashboard
            </Button>
            <Button
              variant="ghost"
              onPress={() => navigate('/pricing')}
              className="border-white/30 bg-white/5"
              textClassName="text-white"
            >
              Preview pricing
            </Button>
          </View>

          <View className="flex flex-row flex-wrap gap-6 pt-2">
            {heroStats.map((stat) => (
              <View key={stat.label} className="min-w-[140px] flex-1 rounded-2xl border border-white/10 bg-white/5 p-4">
                <Typography variant="h3" className="text-white">
                  {stat.value}
                </Typography>
                <Typography variant="caption" className="text-white/70">
                  {stat.label}
                </Typography>
              </View>
            ))}
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
              <CardContent className="gap-3 pt-6">
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

      <View className="flex flex-col gap-6">
        <Typography variant="h2">Launch-ready integrations</Typography>
        <View className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {integrationHighlights.map((item) => (
            <Card key={item.title} className="h-full border-slate-200">
              <CardContent className="gap-3 pt-6">
                <View className="w-12 rounded-2xl bg-brand-50 p-3">
                  <View className="h-6 w-6 rounded-lg bg-brand-500/20" />
                </View>
                <Typography variant="h3">{item.title}</Typography>
                <Typography variant="bodySmall">{item.description}</Typography>
              </CardContent>
            </Card>
          ))}
        </View>
      </View>

      <Card className="bg-white">
        <CardContent className="gap-4 pt-6 md:flex-row md:items-center md:justify-between">
          <View className="flex-1 space-y-3">
            <Typography variant="body" className="text-lg text-ink">
              {testimonial.quote}
            </Typography>
            <Typography variant="caption" className="text-ink">
              {testimonial.author}
            </Typography>
            <Typography variant="caption" className="text-slate-500">
              {testimonial.role}
            </Typography>
          </View>
          <Button variant="secondary" onPress={() => void handleOpenDashboard()}>
            Try the dashboard
          </Button>
        </CardContent>
      </Card>
    </View>
  );
};

export default Home;
