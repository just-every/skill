import React, { useCallback } from 'react';
import { Pressable, View } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { useRouterContext } from '../router/RouterProvider';
import { Button } from '../components/ui';
import { Typography } from '../components/Typography';
import PixelBlastBackdrop from '../components/backgrounds/PixelBlastBackdrop';

const heroFeatures = [
  {
    title: 'Launch-ready front door',
    description: 'Marketing shell, dashboard, and auth share one design system with real content and flows.',
  },
  {
    title: 'Cloudflare native ops',
    description: 'Workers, D1, R2, and Wrangler automation land as one push—no improvised scaffolding.',
  },
  {
    title: 'Billing that ships',
    description: 'Stripe products, plans, and webhook handlers are seeded locally then promoted via CI.',
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
  { label: 'Bootstrap to live', value: '≈ 8 minutes' },
  { label: 'Cloudflare primitives', value: 'Workers · D1 · R2' },
  { label: 'Billing journeys', value: 'Stripe-hosted + webhooks' },
];

const Home = () => {
  const { navigate } = useRouterContext();
  const { isAuthenticated, openHostedLogin } = useAuth();

  const handleOpenDashboard = useCallback(() => {
    if (isAuthenticated) {
      navigate('/app');
      return;
    }
    openHostedLogin({ returnPath: '/app/overview' });
  }, [isAuthenticated, navigate, openHostedLogin]);

  return (
    <View className="flex flex-col gap-16 pb-12">
      <View
        accessibilityRole="header"
        className="relative left-1/2 w-screen -ml-[50vw]"
      >
        <View className="relative min-h-screen w-full overflow-hidden bg-slate-950">
          <PixelBlastBackdrop
            className="absolute inset-0"
            style={{ opacity: 0.92, mixBlendMode: 'screen' }}
            speed={0.45}
            rippleIntensityScale={1.3}
            edgeFade={0.2}
          />
          <View className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/5 via-slate-950/40 to-slate-950/85" />
          <View className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-slate-950/80 via-slate-950/30 to-transparent" />
          <View className="relative z-10 flex h-full items-center px-4 pb-16 pt-28 sm:px-10 sm:pt-32 lg:px-16 lg:pt-40">
            <View className="mx-auto w-full max-w-5xl">
              <View className="max-w-2xl space-y-6 rounded-[32px] bg-transparent p-8 sm:p-12 shadow-[0_50px_120px_rgba(2,6,23,0.75)] backdrop-blur-3xl">
                <View className="self-start rounded-full border border-white/20 bg-white/5 px-4 py-1">
                  <Typography variant="caption" className="text-xs uppercase tracking-[0.35em] text-white/80">
                    Cloudflare · Stripe ready
                  </Typography>
                </View>
                <Typography variant="eyebrow" className="text-accent">
                  justevery starter
                </Typography>
                <Typography
                  variant="h1"
                  className="text-4xl font-semibold leading-[1.08] text-white sm:text-5xl lg:text-6xl"
                >
                  Launch the front door people remember.
                </Typography>
                <Typography variant="body" className="text-base text-white/80 sm:text-lg">
                  Ship the Worker API, Better Auth session layer, and Stripe billing journeys together—without
                  babysitting scaffolding. It feels like a finished product on day one.
                </Typography>
                <View className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-center">
                  <Button
                    onPress={() => void handleOpenDashboard()}
                    className="bg-white text-ink shadow-[0_20px_45px_rgba(15,23,42,0.45)]"
                    textClassName="text-ink"
                  >
                    Enter the live dashboard
                  </Button>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => navigate('/pricing')}
                    className="flex flex-row items-center gap-2"
                  >
                    <Typography variant="body" className="text-white/80">
                      Read the architecture notes
                    </Typography>
                    <Typography variant="body" className="text-white">
                      →
                    </Typography>
                  </Pressable>
                </View>
                <View className="mt-6 flex flex-col gap-4 border-t border-white/15 pt-6 sm:flex-row">
                  {heroStats.map((stat) => (
                    <View
                      key={stat.label}
                      className="flex-1 rounded-2xl border border-white/15 bg-white/5 p-4"
                    >
                      <Typography variant="h3" className="text-white">
                        {stat.value}
                      </Typography>
                      <Typography variant="caption" className="text-white/70">
                        {stat.label}
                      </Typography>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Band 1 – value proposition trio */}
      <View className="flex flex-col gap-4">
        <Typography variant="h2" className="text-ink">
          A starter that feels finished
        </Typography>
        <Typography variant="body" className="max-w-2xl text-slate-500">
          Opinionated defaults for Workers, auth, and billing mean you spend energy on your product, not another set of
          placeholder screens.
        </Typography>
        <View className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {heroFeatures.map((feature) => (
            <View key={feature.title} className="space-y-3">
              <Typography variant="h3" className="text-xl text-ink">
                {feature.title}
              </Typography>
              <Typography variant="bodySmall" className="text-slate-500">
                {feature.description}
              </Typography>
            </View>
          ))}
        </View>
      </View>

      {/* Band 2 – social proof + integrations */}
      <View className="flex flex-col gap-8 rounded-3xl border border-white/10 bg-slate-950/90 p-8 text-white md:flex-row md:items-center md:justify-between">
        <View className="flex-1 space-y-3">
          <Typography variant="eyebrow" className="text-accent">
            Trusted wiring out of the box
          </Typography>
          <Typography variant="body" className="text-lg text-white">
            {testimonial.quote}
          </Typography>
          <Typography variant="caption" className="text-white/80">
            {testimonial.author}
          </Typography>
          <Typography variant="caption" className="text-white/60">
            {testimonial.role}
          </Typography>
        </View>
        <View className="flex-1 space-y-3 md:pl-10">
          <Typography variant="caption" className="text-white/60">
            Native journeys for
          </Typography>
          <View className="flex flex-wrap gap-2">
            {integrationHighlights.map((item) => (
              <View
                key={item.title}
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1"
              >
                <Typography variant="caption" className="text-white">
                  {item.title}
                </Typography>
              </View>
            ))}
          </View>
          <Typography variant="bodySmall" className="text-white/70">
            {integrationHighlights[0].description}
          </Typography>
        </View>
      </View>

      {/* Band 3 – closing CTA */}
      <View className="flex flex-col gap-4 rounded-3xl bg-gradient-to-r from-ink via-slate-900 to-brand-900 px-6 py-8 text-white md:flex-row md:items-center md:justify-between">
        <View className="space-y-2">
          <Typography variant="h3" className="text-3xl">
            Open the starter. Ship the product.
          </Typography>
          <Typography variant="bodySmall" className="text-white/75">
            Step into the live dashboard with Better Auth, Worker APIs, and Stripe billing already humming.
          </Typography>
        </View>
        <Button variant="secondary" onPress={() => void handleOpenDashboard()} className="px-6 py-4">
          Launch dashboard
        </Button>
      </View>
    </View>
  );
};

export default Home;
