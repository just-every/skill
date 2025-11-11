import React from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import type { Company, Invoice, Member, Product, SubscriptionSummary } from '../types';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Label } from '../../components/ui';

type BillingScreenProps = {
  readonly company?: Company;
  readonly subscription?: SubscriptionSummary;
  readonly products?: Product[];
  readonly invoices?: Invoice[];
  readonly viewerRole?: Member['role'];
  readonly onOpenCheckout?: (priceId: string) => Promise<{ url: string }>;
  readonly onOpenPortal?: () => Promise<{ url: string }>;
};

const invoiceStatusVariant: Record<Invoice['status'], 'default' | 'success' | 'warning' | 'danger' | 'muted'> = {
  draft: 'muted',
  open: 'warning',
  paid: 'success',
  void: 'muted',
  uncollectible: 'danger'
};

const BillingScreen = ({ company, subscription, products = [], invoices = [], viewerRole, onOpenCheckout, onOpenPortal }: BillingScreenProps) => {
  const [isLoading, setIsLoading] = React.useState(false);

  // Determine if viewer can manage billing (Owner, Admin, or Billing)
  const canManageBilling = viewerRole === 'Owner' || viewerRole === 'Admin' || viewerRole === 'Billing';

  // Determine if viewer can view invoices (Owner, Admin, or Billing)
  const canViewInvoices = viewerRole === 'Owner' || viewerRole === 'Admin' || viewerRole === 'Billing';

  const handleOpenPortal = async () => {
    if (!onOpenPortal || !canManageBilling) return;
    setIsLoading(true);
    try {
      const result = await onOpenPortal();
      if (result?.url) {
        await Linking.openURL(result.url);
      }
    } catch (error) {
      console.error('Failed to open portal:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCheckout = async (priceId: string) => {
    if (!onOpenCheckout || !canManageBilling) return;
    setIsLoading(true);
    try {
      const result = await onOpenCheckout(priceId);
      if (result?.url) {
        await Linking.openURL(result.url);
      }
    } catch (error) {
      console.error('Failed to open checkout:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount / 100);
  };

  return (
    <View className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <View>
            <CardTitle>Plan summary</CardTitle>
            <CardDescription>Keep your organization in lockstep across billing and seats.</CardDescription>
          </View>
          <Badge variant={subscription?.active ? 'success' : 'danger'}>
            {subscription?.active ? 'Active' : 'Inactive'}
          </Badge>
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
          <Button
            variant="ghost"
            disabled={!canManageBilling || isLoading}
            onPress={handleOpenPortal}
            className="w-full justify-center"
          >
            {isLoading ? 'Loading...' : 'Manage in Stripe'}
          </Button>
        </CardContent>
      </Card>

      {products.length > 0 && canManageBilling && (
        <Card>
          <CardHeader>
            <CardTitle>Available plans</CardTitle>
            <CardDescription>Upgrade or change your subscription plan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {products.map((product) => (
              <View key={product.id} className="flex flex-row items-center justify-between rounded-lg border border-slate-200 p-4">
                <View className="space-y-1">
                  <Text className="text-base font-semibold text-ink">{product.name}</Text>
                  {product.description && (
                    <Text className="text-sm text-slate-500">{product.description}</Text>
                  )}
                  <Text className="text-sm font-medium text-slate-700">
                    {formatCurrency(product.unitAmount, product.currency)}
                    {product.interval && `/${product.interval}`}
                  </Text>
                </View>
                <Button
                  variant="default"
                  onPress={() => handleOpenCheckout(product.priceId)}
                  disabled={isLoading}
                >
                  Select
                </Button>
              </View>
            ))}
          </CardContent>
        </Card>
      )}

      {canViewInvoices && (
        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>View and download your billing invoices.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {invoices.length > 0 ? (
              <ScrollView className="max-h-96">
                {invoices.map((invoice) => (
                  <View
                    key={invoice.id}
                    className="flex flex-row items-center justify-between border-b border-slate-100 px-6 py-4 last:border-b-0"
                  >
                    <View className="space-y-1">
                      <Text className="text-base font-semibold text-ink">{invoice.number}</Text>
                      <Text className="text-sm text-slate-500">
                        {new Date(invoice.created).toLocaleDateString()}
                      </Text>
                    </View>
                    <View className="flex flex-row items-center gap-3">
                      <View className="text-right">
                        <Text className="text-base font-semibold text-ink">
                          {formatCurrency(invoice.amountDue, invoice.currency)}
                        </Text>
                        <Badge variant={invoiceStatusVariant[invoice.status]} className="mt-1">
                          {invoice.status}
                        </Badge>
                      </View>
                      {invoice.invoicePdf && (
                        <Pressable onPress={() => invoice.invoicePdf && Linking.openURL(invoice.invoicePdf)}>
                          <View className="rounded px-3 py-2 hover:bg-slate-100">
                            <Text className="text-sm font-medium text-sky-600">Download</Text>
                          </View>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View className="px-6 py-8 text-center">
                <Text className="text-sm text-slate-500">No invoices yet</Text>
              </View>
            )}
          </CardContent>
        </Card>
      )}

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
