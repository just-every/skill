import React, { useCallback } from 'react';
import { Pressable, View, Platform, Image } from 'react-native';
import type { ViewStyle } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import {
  faBolt,
  faCode,
  faCreditCard,
  faRocket,
  faServer,
  faShieldHalved,
  faArrowRight,
} from '@fortawesome/pro-solid-svg-icons';

import { useAuth } from '../auth/AuthProvider';
import { useRouterContext } from '../router/RouterProvider';
import { Button } from '../components/ui';
import { Typography } from '../components/Typography';
import EffectsBackdrop from '../components/backgrounds/EffectsBackdrop';
import { Container } from '../components/Container';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';

const heroFeatures = [
  {
    title: 'Launch-ready front door',
    description: 'Marketing shell, dashboard, and auth share one design system with real content and flows.',
    icon: faRocket,
  },
  {
    title: 'Cloudflare native ops',
    description: 'Workers, D1, R2, and Wrangler automation land as one push—no improvised scaffolding.',
    icon: faBolt,
  },
  {
    title: 'Billing that ships',
    description: 'Stripe products, plans, and webhook handlers are seeded locally then promoted via CI.',
    icon: faCreditCard,
  },
];

const howItWorksSteps = [
  {
    title: 'Clone & Bootstrap',
    description: 'Run one command to provision your D1 database, R2 buckets, and Stripe secrets.',
    icon: faCode,
  },
  {
    title: 'Local Development',
    description: 'Develop with full offline support for auth and billing using our local worker emulation.',
    icon: faServer,
  },
  {
    title: 'Deploy to Edge',
    description: 'Push to Cloudflare Workers and Stripe with a single command. Global scale by default.',
    icon: faShieldHalved,
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

  const heroBackdropStyle: (ViewStyle & { backdropFilter?: string }) | undefined =
    Platform.OS === 'web' ? { backdropFilter: 'blur(1px)' } : undefined;

  return (
    <View className="flex flex-col gap-24 pb-24">
      {/* Hero Section */}
      <View
        accessibilityRole="header"
        className="relative left-1/2 w-screen -ml-[50vw]"
      >
        <View className="relative min-h-[90vh] w-full overflow-hidden bg-slate-950">
          <EffectsBackdrop
            className="absolute inset-0"
            style={{ opacity: 0.92, mixBlendMode: 'screen' }}
          />
          <View className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/5 via-slate-950/40 to-slate-950/85" />
          <View className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-slate-950/80 via-slate-950/30 to-transparent" />
          
          <Container className="relative z-10 flex h-full flex-col justify-center py-28 sm:py-36 lg:py-48">
            <View className="flex flex-col gap-12 lg:flex-row lg:items-center lg:justify-between">
              {/* Left Column: Text */}
              <View className="w-full max-w-2xl lg:w-1/2">
                <View
                  className="space-y-8 rounded-[32px] bg-transparent p-6 sm:p-10 lg:p-14 shadow-none lg:shadow-[0_50px_120px_rgba(2,6,23,0.75)] lg:bg-slate-950/30"
                  style={heroBackdropStyle}
                >
                  <View className="mb-4 self-start rounded-full border border-white/20 bg-white/5 px-5 py-1">
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
                      className="flex flex-row items-center gap-2 px-4 py-2"
                    >
                      <Typography variant="body" className="text-white/80">
                        Read the architecture notes
                      </Typography>
                      <FontAwesomeIcon icon={faArrowRight} size={14} color="rgba(255,255,255,0.8)" />
                    </Pressable>
                  </View>
                  
                  <View className="mt-10 flex flex-col gap-5 border-t border-white/15 pt-8 sm:flex-row">
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

              {/* Right Column: Image */}
              <View className="hidden w-full lg:block lg:w-1/2 lg:pl-10">
                 <View className="relative z-10 overflow-hidden rounded-3xl border border-white/10 bg-slate-900/50 shadow-2xl shadow-brand-500/20">
                    <Image
                      source={{ uri: '/hero-dashboard.png' }}
                      style={{ width: '100%', height: 600, resizeMode: 'cover' }}
                      accessibilityLabel="Dashboard Preview"
                    />
                    <View className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent pointer-events-none" />
                 </View>
              </View>
            </View>
          </Container>
        </View>
      </View>

      <Container>
        {/* How it works Section */}
        <View className="mb-24 flex flex-col gap-12">
          <View className="text-center">
             <Typography variant="h2" className="text-center text-ink">
              From zero to deployed in minutes
            </Typography>
            <Typography variant="body" className="mx-auto mt-4 max-w-2xl text-center text-slate-500">
              We've automated the boring parts so you can focus on building your product.
            </Typography>
          </View>
          
          <View className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {howItWorksSteps.map((step, index) => (
              <View key={step.title} className="relative flex flex-col items-center text-center">
                 <View className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                    <FontAwesomeIcon icon={step.icon} size={24} />
                 </View>
                 <Typography variant="h3" className="mb-3 text-xl text-ink">
                   {step.title}
                 </Typography>
                 <Typography variant="bodySmall" className="text-slate-500">
                   {step.description}
                 </Typography>
                 {index < howItWorksSteps.length - 1 && (
                    <View className="absolute right-0 top-8 hidden w-1/2 -mr-[25%] border-t-2 border-dashed border-slate-200 lg:block" />
                 )}
              </View>
            ))}
          </View>
        </View>

        {/* Band 1 – value proposition trio */}
        <View className="flex flex-col gap-8">
          <View>
             <Typography variant="h2" className="text-ink">
              A starter that feels finished
            </Typography>
            <Typography variant="body" className="mt-4 max-w-2xl text-slate-500">
              Opinionated defaults for Workers, auth, and billing mean you spend energy on your product, not another set of
              placeholder screens.
            </Typography>
          </View>
          
          <View className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {heroFeatures.map((feature) => (
              <Card key={feature.title} className="bg-slate-50/50 transition-all hover:bg-white hover:shadow-lg">
                <CardHeader>
                  <View className="mb-4 w-10 h-10 rounded-lg bg-white border border-slate-100 flex items-center justify-center shadow-sm">
                    <FontAwesomeIcon icon={feature.icon} size={18} color="#0f172a" />
                  </View>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </View>
        </View>

        {/* Band 2 – social proof + integrations */}
        <View className="mt-24 flex flex-col gap-8 rounded-3xl border border-white/10 bg-slate-950/90 p-8 text-white md:flex-row md:items-center md:justify-between">
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
        <View className="mt-12 flex flex-col gap-4 rounded-3xl bg-gradient-to-r from-ink via-slate-900 to-brand-900 px-6 py-8 text-white md:flex-row md:items-center md:justify-between">
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
      </Container>
    </View>
  );
};

export default Home;
