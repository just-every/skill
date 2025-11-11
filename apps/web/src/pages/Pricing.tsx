import React from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useRouterContext } from '../router/RouterProvider';
import { Button } from '../components/ui';

type PricingTier = {
  name: string;
  price: string;
  description: string;
  features: string[];
};

const tiers: PricingTier[] = [
  {
    name: 'Sandbox',
    price: '$0',
    description: 'Verify the stack locally with seeded data and stubbed Stripe products.',
    features: ['Worker + D1 seeded with fixtures', 'R2 uploads locked behind Better Auth', 'Expo marketing shell']
  },
  {
    name: 'Launch',
    price: '$29',
    description: 'Promote to production with Better Auth + Stripe wired to your live tenants.',
    features: [
      'Bootstrap CLI deploys Worker, D1, and R2',
      'Stripe webhook + product sync',
      'Managed marketing pages and dashboard'
    ]
  },
  {
    name: 'Scale',
    price: 'Talk to us',
    description: 'Extended support, multi-tenant hardening, and white-glove integrations.',
    features: [
      'Multi-region Workers + KV session caching',
      'Usage metering integrate with Stripe Billing',
      'Hands-on migration assistance'
    ]
  }
];

const Pricing = () => {
  const { navigate } = useRouterContext();

  return (
    <ScrollView className="flex-1 bg-surface px-4 py-10">
      <View className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <View className="space-y-3">
          <Text className="text-4xl font-bold text-ink">Pricing preview</Text>
          <Text className="text-base text-slate-600">
            These tiers map to Stripe products seeded by the bootstrap CLI. Tailor products locally, then sync the
            definitions to Stripe when you deploy.
          </Text>
        </View>

        <View className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {tiers.map((tier) => (
            <View
              key={tier.name}
              className="flex min-h-[360px] flex-col gap-6 rounded-3xl border border-slate-200 bg-white p-6"
            >
              <View className="space-y-1">
                <Text className="text-2xl font-bold text-ink">{tier.name}</Text>
                <Text className="text-3xl font-bold text-accent">{tier.price}</Text>
              </View>
              <Text className="text-slate-600">{tier.description}</Text>
              <View className="space-y-2">
                {tier.features.map((feature) => (
                  <View key={feature} className="flex-row items-start gap-2">
                    <Text className="text-accent">•</Text>
                    <Text className="text-sm text-slate-600">{feature}</Text>
                  </View>
                ))}
              </View>
              <Button
                variant="secondary"
                className="mt-auto w-full justify-center"
                onPress={() => navigate('/app')}
              >
                See it in action
              </Button>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
};

export default Pricing;
