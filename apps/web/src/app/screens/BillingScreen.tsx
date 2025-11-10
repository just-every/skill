import React from 'react';
import { Text, View } from 'react-native';

import type { Company, SubscriptionSummary } from '../types';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Label } from '../../components/ui';

type BillingScreenProps = {
  readonly company?: Company;
  readonly subscription?: SubscriptionSummary;
};

const BillingScreen = ({ company, subscription }: BillingScreenProps) => {
  return (
    <View className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <View>
            <CardTitle>Plan summary</CardTitle>
            <CardDescription>Keep your organization in lockstep across billing and seats.</CardDescription>
          </View>
          <Badge>{subscription?.status ?? 'active'}</Badge>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field label="Current plan" value={subscription?.plan ?? company?.plan ?? 'Not set'} />
          <Field label="Seats" value={String(subscription?.seats ?? company?.stats?.seats ?? 0)} />
          <Field
            label="Renews on"
            value={subscription?.renewsOn ? new Date(subscription.renewsOn).toLocaleDateString() : 'Pending Stripe sync'}
          />
        </CardContent>
        <CardContent className="pt-0">
          <Button variant="ghost" disabled className="w-full justify-center">
            Manage in Stripe (coming soon)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing contact</CardTitle>
          <CardDescription>Send invoices and renewal notices to a shared mailbox.</CardDescription>
        </CardHeader>
        <CardContent>
          <Label required>Email</Label>
          <Field label="" value={company?.billingEmail ?? 'billing@your-company.com'} hideLabel />
          <CardDescription>
            Update this email via the Worker endpoint (`/api/accounts/:slug`) once persistence is enabled.
          </CardDescription>
        </CardContent>
      </Card>
    </View>
  );
};

const Field = ({ label, value, hideLabel }: { label?: string; value: string; hideLabel?: boolean }) => (
  <View className="space-y-2">
    {!hideLabel && label ? <Label>{label}</Label> : null}
    <View className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
      <Text className="text-base text-ink">{value}</Text>
    </View>
  </View>
);

export default BillingScreen;
