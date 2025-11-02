import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, Text, View } from 'react-native';

import { WORKER_ORIGIN, WorkerLink, workerUrl } from './_components/RouteRedirect';

type StripeProduct = {
  name?: string;
  amount?: number;
  currency?: string;
  interval?: string;
  [key: string]: unknown;
};

type ProductsResponse = {
  products: StripeProduct[];
  error?: string;
};

type AsyncState<T> =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'success'; data: T }
  | { state: 'error'; error: string };

const PRODUCTS_ENDPOINT = '/api/stripe/products';

export default function PaymentsScreen() {
  const [productsState, setProductsState] = useState<AsyncState<ProductsResponse>>({ state: 'idle' });

  useEffect(() => {
    if (!WORKER_ORIGIN) {
      setProductsState({
        state: 'error',
        error:
          'Set EXPO_PUBLIC_WORKER_ORIGIN to fetch Stripe products from the deployed Worker.',
      });
      return;
    }

    let cancelled = false;

    async function loadProducts() {
      setProductsState({ state: 'loading' });
      try {
        const response = await fetch(workerUrl(PRODUCTS_ENDPOINT));
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const payload = (await response.json()) as ProductsResponse;
        if (!cancelled) {
          setProductsState({ state: 'success', data: payload });
        }
      } catch (error) {
        if (!cancelled) {
          setProductsState({
            state: 'error',
            error: (error as Error).message,
          });
        }
      }
    }

    loadProducts();
    return () => {
      cancelled = true;
    };
  }, []);

  const renderProducts = () => {
    switch (productsState.state) {
      case 'idle':
      case 'loading':
        return (
          <View style={{ alignItems: 'center', paddingVertical: 32, gap: 12 }}>
            <ActivityIndicator color="#38bdf8" />
            <Text style={{ color: '#cbd5f5' }}>Fetching Stripe products…</Text>
          </View>
        );
      case 'error':
        return (
          <View style={{ gap: 12 }}>
            <Text style={{ color: '#f97171', fontWeight: '600' }}>Unable to load products</Text>
            <Text style={{ color: '#cbd5f5', lineHeight: 20 }}>{productsState.error}</Text>
            <WorkerLink path="/login" label="Sign in to refresh session" />
          </View>
        );
      case 'success':
        if (!productsState.data.products?.length) {
          return (
            <View style={{ gap: 12 }}>
              <Text style={{ color: '#facc15', fontWeight: '600' }}>No products configured yet.</Text>
              <Text style={{ color: '#cbd5f5' }}>
                Update <Text style={{ fontWeight: '700' }}>STRIPE_PRODUCTS</Text> in your environment or sync live
                products via the bootstrap script.
              </Text>
            </View>
          );
        }

        return (
          <FlatList
            scrollEnabled={false}
            data={productsState.data.products}
            keyExtractor={(item, index) => `${item.name ?? 'product'}-${index}`}
            ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
            renderItem={({ item }) => (
              <View
                style={{
                  backgroundColor: 'rgba(30, 41, 59, 0.65)',
                  borderRadius: 20,
                  padding: 24,
                  borderWidth: 1,
                  borderColor: 'rgba(59, 130, 246, 0.3)',
                  gap: 12,
                }}
              >
                <Text style={{ color: '#38bdf8', fontSize: 20, fontWeight: '600' }}>{item.name ?? 'Untitled plan'}</Text>
                <Text style={{ color: '#e2e8f0', fontSize: 28, fontWeight: '700' }}>
                  {formatAmount(item.amount, item.currency)}
                  <Text style={{ fontSize: 16, color: '#94a3b8' }}>
                    {' '}
                    per {item.interval ?? 'interval'}
                  </Text>
                </Text>
                <Text style={{ color: '#94a3b8' }}>
                  Configure prices in Stripe and cache them here for instant load times across projects.
                </Text>
              </View>
            )}
          />
        );
      default:
        return null;
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        paddingVertical: 48,
        paddingHorizontal: 24,
        backgroundColor: '#020617',
      }}
    >
      <View
        style={{
          maxWidth: 820,
          width: '100%',
          alignSelf: 'center',
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          borderRadius: 32,
          borderWidth: 1,
          borderColor: 'rgba(56, 189, 248, 0.25)',
          padding: 32,
          gap: 20,
        }}
      >
        <View style={{ gap: 8 }}>
          <Text style={{ color: '#38bdf8', textTransform: 'uppercase', letterSpacing: 3 }}>Stripe Preview</Text>
          <Text style={{ color: '#e2e8f0', fontSize: 26, fontWeight: '700' }}>Products ready for checkout</Text>
          <Text style={{ color: '#cbd5f5', lineHeight: 20 }}>
            These values come from the Worker configuration. When you deploy, connect live product IDs or call
            Stripe APIs inside the Worker to hydrate this list dynamically.
          </Text>
        </View>

        {renderProducts()}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <WorkerLink path="/app" label="Back to dashboard" variant="secondary" />
          <WorkerLink path="/checkout" label="Checkout (placeholder)" />
          <WorkerLink path="/login" label="Sign in again" />
        </View>
      </View>
    </ScrollView>
  );
}

function formatAmount(amount?: number, currency = 'usd') {
  if (typeof amount !== 'number' || Number.isNaN(amount)) {
    return '—';
  }
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  });
  return formatter.format(amount / 100);
}
