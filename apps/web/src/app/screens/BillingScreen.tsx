import React from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import type { Company, Invoice, Member, Product, SubscriptionSummary } from '../types';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '../../components/ui';
import { useUpdateBillingEmailMutation } from '../hooks';

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
  const [portalPending, setPortalPending] = React.useState(false);
  const [checkoutState, setCheckoutState] = React.useState<{ priceId: string | null; status: 'idle' | 'pending' | 'error'; message?: string }>({
    priceId: null,
    status: 'idle'
  });
  const [isEditingEmail, setIsEditingEmail] = React.useState(false);
  const [draftEmail, setDraftEmail] = React.useState(company?.billingEmail ?? '');
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [emailError, setEmailError] = React.useState<string | null>(null);

  const updateBillingEmailMutation = useUpdateBillingEmailMutation(company?.id, company?.slug);

  React.useEffect(() => {
    setDraftEmail(company?.billingEmail ?? '');
  }, [company?.billingEmail]);

  React.useEffect(() => {
    if (!successMessage) {
      return;
    }
    const timeout = setTimeout(() => setSuccessMessage(null), 4_000);
    return () => clearTimeout(timeout);
  }, [successMessage]);

  // Determine if viewer can manage billing (Owner, Admin, or Billing)
  const canManageBilling = viewerRole === 'Owner' || viewerRole === 'Admin' || viewerRole === 'Billing';

  // Determine if viewer can view invoices (Owner, Admin, or Billing)
  const canViewInvoices = viewerRole === 'Owner' || viewerRole === 'Admin' || viewerRole === 'Billing';

  const redirectToUrl = async (url: string) => {
    if (typeof window !== 'undefined') {
      window.location.assign(url);
      return;
    }
    await Linking.openURL(url);
  };

  const handleOpenPortal = async () => {
    if (!onOpenPortal || !canManageBilling) return;
    setPortalPending(true);
    try {
      const result = await onOpenPortal();
      if (result?.url) {
        await redirectToUrl(result.url);
      } else {
        throw new Error('Stripe portal did not return a URL');
      }
    } catch (error) {
      console.error('Failed to open portal:', error);
    } finally {
      setPortalPending(false);
    }
  };

  const handleOpenCheckout = async (priceId: string) => {
    if (!onOpenCheckout || !canManageBilling) return;
    setCheckoutState({ priceId, status: 'pending' });
    try {
      const result = await onOpenCheckout(priceId);
      if (result?.url) {
        await redirectToUrl(result.url);
        return;
      }
      throw new Error('Stripe checkout did not return a URL');
    } catch (error) {
      console.error('Failed to open checkout:', error);
      const message = error instanceof Error ? error.message : 'Unable to start checkout';
      setCheckoutState({ priceId: null, status: 'error', message });
    }
  };

  const dismissCheckoutError = () => {
    setCheckoutState({ priceId: null, status: 'idle' });
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
            disabled={!canManageBilling || portalPending}
            onPress={handleOpenPortal}
            className="w-full justify-center"
          >
            {portalPending ? 'Opening portal…' : 'Manage in Stripe'}
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
            {checkoutState.status === 'error' && (
              <View className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                <Text className="text-sm font-semibold text-rose-900">Checkout failed</Text>
                <Text className="mt-1 text-xs text-rose-700">
                  {checkoutState.message ?? 'Unable to reach Stripe. Try again or verify your network connection.'}
                </Text>
                <Pressable onPress={dismissCheckoutError} className="mt-2 self-start border-b border-rose-400">
                  <Text className="text-xs font-semibold text-rose-700">Dismiss</Text>
                </Pressable>
              </View>
            )}
            {products.map((product) => {
              const canCheckoutProduct = Boolean(product.priceId && !product.priceId.startsWith('legacy:'));
              const isPendingCheckout =
                checkoutState.status === 'pending' && checkoutState.priceId === product.priceId;
              return (
                <View key={product.id} className="flex flex-col gap-1">
                  <View className="flex flex-row items-center justify-between rounded-lg border border-slate-200 p-4">
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
                      testID={`billing-product-select-${product.id}`}
                      onPress={() => {
                        if (!product.priceId || !canCheckoutProduct) {
                          return;
                        }
                        handleOpenCheckout(product.priceId);
                      }}
                      disabled={!canCheckoutProduct || checkoutState.status === 'pending'}
                    >
                      {isPendingCheckout ? 'Redirecting…' : 'Select'}
                    </Button>
                  </View>
                  {!canCheckoutProduct && (
                    <Text className="px-4 text-[10px] text-slate-500">
                      Configure a Stripe price ID to enable checkout for this plan.
                    </Text>
                  )}
                </View>
              );
            })}
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
          <View>
            <CardTitle>Billing contact</CardTitle>
            <CardDescription>Send invoices and renewal notices to the right mailbox.</CardDescription>
          </View>
        </CardHeader>
        <CardContent className="space-y-4">
          <Label required>Email</Label>
          <View className="space-y-3">
            {isEditingEmail ? (
              <Input
                testID="billing-contact-input"
                value={draftEmail}
                onChangeText={(value) => setDraftEmail(value)}
                errorText={emailError ?? undefined}
                placeholder="billing@your-company.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            ) : (
              <View
                testID="billing-contact-value"
                className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
              >
                <Text className="text-base text-ink">{company?.billingEmail ?? 'billing@your-company.com'}</Text>
              </View>
            )}
            <View className="flex flex-row flex-wrap gap-2">
              {canManageBilling ? (
                isEditingEmail ? (
                  <>
                    <Button
                      variant="default"
                      testID="billing-contact-save"
                      onPress={async () => {
                        setEmailError(null);
                        try {
                          await updateBillingEmailMutation.mutateAsync(draftEmail ? draftEmail : null);
                          setSuccessMessage('Billing contact updated.');
                          setIsEditingEmail(false);
                        } catch (error) {
                          setEmailError(error instanceof Error ? error.message : 'Unable to update billing contact');
                        }
                      }}
                      disabled={updateBillingEmailMutation.isLoading}
                      className="min-w-[120px] justify-center"
                    >
                      {updateBillingEmailMutation.isLoading ? 'Saving…' : 'Save'}
                    </Button>
                    <Button
                      variant="ghost"
                      testID="billing-contact-cancel"
                      onPress={() => {
                        setDraftEmail(company?.billingEmail ?? '');
                        setEmailError(null);
                        setIsEditingEmail(false);
                      }}
                      disabled={updateBillingEmailMutation.isLoading}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button variant="default" testID="billing-contact-edit" onPress={() => setIsEditingEmail(true)}>
                    Edit
                  </Button>
                )
              ) : null}
            </View>
            {successMessage && <Text className="text-sm text-success">{successMessage}</Text>}
            {emailError && <Text className="text-sm text-danger">{emailError}</Text>}
          </View>
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
