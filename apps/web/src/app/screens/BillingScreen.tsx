import React from 'react';
import { Pressable, Text, View } from 'react-native';

import type { Company, SubscriptionSummary } from '../types';

type BillingScreenProps = {
  readonly company?: Company;
  readonly subscription?: SubscriptionSummary;
};

const BillingScreen = ({ company, subscription }: BillingScreenProps) => {
  return (
    <View style={{ gap: 24 }}>
      <View style={{ backgroundColor: '#ffffff', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#e2e8f0' }}>
        <Text style={{ color: '#0f172a', fontSize: 22, fontWeight: '700' }}>Plan summary</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap', gap: 12 }}>
          <View>
            <Text style={{ color: '#94a3b8' }}>Current plan</Text>
            <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '700' }}>{subscription?.plan ?? company?.plan ?? 'Not set'}</Text>
          </View>
          <View>
            <Text style={{ color: '#94a3b8' }}>Seats</Text>
            <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '700' }}>{subscription?.seats ?? company?.stats?.seats ?? 0}</Text>
          </View>
          <View>
            <Text style={{ color: '#94a3b8' }}>Renews on</Text>
            <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '700' }}>
              {subscription?.renewsOn ? new Date(subscription.renewsOn).toLocaleDateString() : 'Pending Stripe sync'}
            </Text>
          </View>
        </View>
        <Pressable style={{ marginTop: 20, borderRadius: 12, borderWidth: 1, borderColor: '#cbd5f5', padding: 12 }}>
          <Text style={{ color: '#0f172a', fontWeight: '600' }}>Manage in Stripe (coming soon)</Text>
        </Pressable>
      </View>

      <View style={{ backgroundColor: '#ffffff', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#e2e8f0', gap: 12 }}>
        <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '700' }}>Billing email</Text>
        <Text style={{ color: '#475569' }}>{company?.billingEmail ?? 'billing@your-company.com'}</Text>
        <Text style={{ color: '#94a3b8' }}>
          Update this email inside the Worker once the `/api/companies/:slug` PATCH endpoint lands.
        </Text>
      </View>
    </View>
  );
};

export default BillingScreen;
