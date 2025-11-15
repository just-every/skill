import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../components/ui';

type BillingReturnScreenProps = {
  readonly variant: 'success' | 'cancel';
  readonly sessionId?: string | null;
  readonly companyName?: string;
  readonly onManageInStripe?: () => Promise<void> | void;
  readonly onBackToBilling?: () => void;
  readonly isManagePending?: boolean;
};

const copyByVariant = {
  success: {
    title: 'Checkout complete',
    description: 'Stripe is finalising your subscription. You will receive a receipt via email in a moment.',
    accent: 'text-emerald-500',
    badge: 'bg-emerald-500/10 text-emerald-400',
  },
  cancel: {
    title: 'Checkout cancelled',
    description: 'No charges were made. You can resume whenever you are ready.',
    accent: 'text-amber-500',
    badge: 'bg-amber-500/10 text-amber-400',
  },
} satisfies Record<'success' | 'cancel', { title: string; description: string; accent: string; badge: string }>;

const formatSessionId = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length <= 12) {
    return trimmed;
  }
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
};

const BillingReturnScreen = ({
  variant,
  sessionId,
  companyName,
  onManageInStripe,
  isManagePending,
  onBackToBilling,
}: BillingReturnScreenProps) => {
  const content = copyByVariant[variant];
  const condensedSessionId = formatSessionId(sessionId);

  return (
    <Card className="border-slate-200 bg-white/90 shadow-sm">
      <CardHeader>
        <Text className={`text-xs font-semibold uppercase tracking-[0.3em] ${content.badge}`}>{variant === 'success' ? 'Success' : 'Cancelled'}</Text>
        <CardTitle className="mt-2 text-2xl text-ink">{content.title}</CardTitle>
        <CardDescription className="text-base text-slate-500">{content.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {companyName ? (
          <View className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Text className="text-xs uppercase tracking-[0.2em] text-slate-400">Company</Text>
            <Text className="mt-1 text-base font-semibold text-ink">{companyName}</Text>
          </View>
        ) : null}
        <View className="rounded-2xl border border-slate-200 px-4 py-3">
          <Text className="text-xs uppercase tracking-[0.2em] text-slate-400">Stripe session</Text>
          {condensedSessionId ? (
            <Text className={`mt-1 font-mono text-sm font-semibold ${content.accent}`}>{condensedSessionId}</Text>
          ) : (
            <Text className="mt-1 text-sm text-slate-500">Session ID not provided</Text>
          )}
          {sessionId ? (
            <Pressable
              accessibilityRole="button"
              className="mt-2 self-start rounded-full bg-slate-100 px-3 py-1"
              onPress={() => {
                if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                  navigator.clipboard.writeText(sessionId).catch(() => undefined);
                }
              }}
            >
              <Text className="text-xs font-semibold text-slate-600">Copy full ID</Text>
            </Pressable>
          ) : null}
        </View>
      </CardContent>
      <CardFooter className="flex flex-col gap-3 md:flex-row">
        <Button
          variant="primary"
          className="flex-1"
          onPress={() => onManageInStripe?.()}
          disabled={isManagePending}
        >
          {isManagePending ? 'Opening portal…' : 'Manage in Stripe'}
        </Button>
        <Button
          variant="ghost"
          className="flex-1 border border-slate-200 bg-white"
          textClassName="text-ink"
          onPress={() => onBackToBilling?.()}
        >
          Return to billing
        </Button>
      </CardFooter>
    </Card>
  );
};

export default BillingReturnScreen;
