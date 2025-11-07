import React from 'react';
import { Pressable, Text, View } from 'react-native';

import type { Company, Member, SubscriptionSummary } from '../types';

type OverviewProps = {
  readonly company?: Company;
  readonly members?: Member[];
  readonly subscription?: SubscriptionSummary;
  readonly onNavigateToTeam?: () => void;
};

const OverviewScreen = ({ company, members, subscription, onNavigateToTeam }: OverviewProps) => {
  const stats = [
    { label: 'Active members', value: company?.stats?.activeMembers ?? members?.length ?? 0 },
    { label: 'Pending invites', value: company?.stats?.pendingInvites ?? 0 },
    { label: 'Seats', value: company?.stats?.seats ?? subscription?.seats ?? 0 },
    { label: 'MRR', value: `$${company?.stats?.mrr?.toLocaleString() ?? '0'}` }
  ];

  return (
    <View style={{ gap: 24 }}>
      <View style={{ backgroundColor: '#0f172a', borderRadius: 24, padding: 24, gap: 16 }}>
        <Text style={{ color: '#38bdf8', fontSize: 15, letterSpacing: 2 }}>Current company</Text>
        <Text style={{ color: '#f8fafc', fontSize: 32, fontWeight: '700' }}>{company?.name ?? 'No company selected'}</Text>
        <Text style={{ color: '#cbd5f5' }}>
          {company?.branding?.tagline ?? 'Connect billing, usage, and asset analytics as soon as your Worker API is live.'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
          <Badge label={company?.plan ?? 'Tier TBD'} color="#38bdf8" />
          <Badge label={company?.industry ?? 'Industry TBD'} color="#facc15" />
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        {stats.map((stat) => (
          <View
            key={stat.label}
            style={{
              flexBasis: '23%',
              minWidth: 200,
              flexGrow: 1,
              backgroundColor: '#ffffff',
              borderRadius: 20,
              borderWidth: 1,
              borderColor: '#e2e8f0',
              padding: 20,
              gap: 6
            }}
          >
            <Text style={{ color: '#94a3b8', fontSize: 12, letterSpacing: 2 }}>{stat.label.toUpperCase()}</Text>
            <Text style={{ color: '#0f172a', fontSize: 28, fontWeight: '700' }}>{stat.value}</Text>
          </View>
        ))}
      </View>

      <View
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 24,
          borderWidth: 1,
          borderColor: '#e2e8f0',
          padding: 24,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16
        }}
      >
        <View style={{ maxWidth: 460, gap: 6 }}>
          <Text style={{ color: '#0f172a', fontSize: 22, fontWeight: '700' }}>Need to add a teammate?</Text>
          <Text style={{ color: '#475569' }}>
            Role-based access is enforced in the Worker once the members/invites endpoints are wired. For now you can
            log intent so the upcoming migrations know which invites to issue.
          </Text>
        </View>
        <Pressable
          onPress={onNavigateToTeam}
          style={{ backgroundColor: '#0f172a', borderRadius: 16, paddingHorizontal: 22, paddingVertical: 12 }}
        >
          <Text style={{ color: '#f8fafc', fontWeight: '600' }}>Open team screen</Text>
        </Pressable>
      </View>
    </View>
  );
};

const Badge = ({ label, color }: { label: string; color: string }) => (
  <View
    style={{
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: `${color}22`,
      borderWidth: 1,
      borderColor: `${color}55`
    }}
  >
    <Text style={{ color, fontWeight: '600' }}>{label}</Text>
  </View>
);

export default OverviewScreen;
