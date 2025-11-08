import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useRouterContext } from '../router/RouterProvider';

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
    <ScrollView contentContainerStyle={{ flexGrow: 1, gap: 32 }}>
      <View style={{ gap: 12 }}>
        <Text style={{ color: '#0f172a', fontSize: 36, fontWeight: '700' }}>Pricing preview</Text>
        <Text style={{ color: '#475569', fontSize: 16 }}>
          These tiers map to Stripe products seeded by the bootstrap CLI. Tailor products locally, then sync the
          definitions to Stripe when you deploy.
        </Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
        {tiers.map((tier) => (
          <View
            key={tier.name}
            style={{
              flexBasis: '30%',
              minWidth: 260,
              flexGrow: 1,
              backgroundColor: '#ffffff',
              borderRadius: 24,
              padding: 24,
              borderWidth: 1,
              borderColor: '#e2e8f0',
              gap: 12
            }}
          >
            <Text style={{ color: '#0f172a', fontSize: 22, fontWeight: '700' }}>{tier.name}</Text>
            <Text style={{ color: '#38bdf8', fontSize: 28, fontWeight: '700' }}>{tier.price}</Text>
            <Text style={{ color: '#475569', fontSize: 15, lineHeight: 22 }}>{tier.description}</Text>
            <View style={{ gap: 8 }}>
              {tier.features.map((feature) => (
                <Text key={feature} style={{ color: '#64748b', fontSize: 14 }}>
                  • {feature}
                </Text>
              ))}
            </View>
            <Pressable
              onPress={() => navigate('/app')}
              style={{
                marginTop: 'auto',
                backgroundColor: '#0f172a',
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: 'center'
              }}
            >
              <Text style={{ color: '#f8fafc', fontWeight: '600' }}>See it in action</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

export default Pricing;
