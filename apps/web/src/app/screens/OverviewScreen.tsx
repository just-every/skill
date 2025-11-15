import React from 'react';
import { Text, View } from 'react-native';

import type { Company, Member, SubscriptionSummary } from '../types';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui';

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
    <View className="flex flex-col gap-6">
      <View className="rounded-3xl bg-gradient-to-br from-ink via-ink to-brand-900 p-6 text-white">
        <Text className="text-xs uppercase tracking-[0.35em] text-slate-200">Current company</Text>
        <Text className="mt-2 text-3xl font-bold text-white">{company?.name ?? 'No company selected'}</Text>
        <Text className="mt-2 text-base text-slate-200">
          {company?.branding?.tagline ?? 'Connect billing, usage, and asset analytics as soon as your Worker API is live.'}
        </Text>
        <View className="mt-4 flex flex-wrap gap-2">
          <Badge>{company?.plan ?? 'Tier TBD'}</Badge>
          <Badge variant="muted">{company?.industry ?? 'Industry TBD'}</Badge>
        </View>
      </View>

      <View className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <View
            key={stat.label}
            className="flex min-h-[140px] flex-col gap-2 rounded-2xl border border-slate-200 bg-white/90 p-5"
          >
            <Text className="text-xs uppercase tracking-[0.4em] text-slate-400">{stat.label}</Text>
            <Text className="text-3xl font-bold text-ink">{stat.value}</Text>
          </View>
        ))}
      </View>

      <Card>
        <CardHeader>
          <CardTitle>Need to add a teammate?</CardTitle>
          <CardDescription>
            Invite emails are generated directly from the Worker and stay active for seven days. Hop into the team
            screen to review pending invites or resend links.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <Button variant="secondary" onPress={onNavigateToTeam} className="px-6 py-3">
            Open team screen
          </Button>
        </CardContent>
      </Card>
    </View>
  );
};

export default OverviewScreen;
