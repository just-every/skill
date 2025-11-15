import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { useRouterContext } from '../router/RouterProvider';
import { usePublicEnv } from '../runtimeEnv';
import {
  useCompaniesQuery,
  useCompanyById,
  useCreateCheckoutMutation,
  useCreatePortalMutation,
  useInvoicesQuery,
  useProductsQuery,
  useSubscriptionQuery,
} from '../app/hooks';
import BillingScreen from '../app/screens/BillingScreen';
import BillingReturnScreen from '../app/screens/BillingReturnScreen';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui';

const resolveBillingReturnState = (path: string): { variant: 'success' | 'cancel'; sessionId: string | null } | null => {
  if (!path.startsWith('/app/billing/')) {
    return null;
  }
  if (path.startsWith('/app/billing/success')) {
    return { variant: 'success', sessionId: extractSessionId(path) };
  }
  if (path.startsWith('/app/billing/cancel')) {
    return { variant: 'cancel', sessionId: extractSessionId(path) };
  }
  return null;
};

const extractSessionId = (path: string): string | null => {
  const queryIndex = path.indexOf('?');
  if (queryIndex === -1) {
    return null;
  }
  const search = path.slice(queryIndex);
  try {
    const params = new URLSearchParams(search);
    return params.get('session_id');
  } catch {
    return null;
  }
};

const Dashboard = () => {
  const { status: authStatus, isAuthenticated, openHostedLogin } = useAuth();
  const env = usePublicEnv();
  const { path } = useRouterContext();

  const companiesQuery = useCompaniesQuery();
  const companies = companiesQuery.data?.accounts ?? [];
  const [activeCompanyId, setActiveCompanyId] = useState<string | undefined>();

  useEffect(() => {
    if (companies.length === 0) {
      return;
    }
    if (!activeCompanyId) {
      const preferred = companiesQuery.data?.currentAccountId ?? companies[0].id;
      setActiveCompanyId(preferred);
    }
  }, [activeCompanyId, companies, companiesQuery.data?.currentAccountId]);

  const activeCompany = useCompanyById(companies, activeCompanyId);

  const subscriptionQuery = useSubscriptionQuery(activeCompany?.id, activeCompany?.slug);
  const productsQuery = useProductsQuery(activeCompany?.slug);
  const invoicesQuery = useInvoicesQuery(activeCompany?.id, activeCompany?.slug);
  const createCheckoutMutation = useCreateCheckoutMutation(activeCompany?.id, activeCompany?.slug);
  const createPortalMutation = useCreatePortalMutation(activeCompany?.id, activeCompany?.slug);

  const billingReturnState = useMemo(() => resolveBillingReturnState(path), [path]);

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      const next = path.startsWith('/app') ? path : '/app/billing';
      openHostedLogin({ returnPath: next });
    }
  }, [authStatus, openHostedLogin, path]);

  if (authStatus !== 'authenticated' || !isAuthenticated) {
    const message = authStatus === 'checking' ? 'Checking your session…' : 'Redirecting to Better Auth…';
    return (
      <View className="flex min-h-screen items-center justify-center bg-slate-950">
        <View className="items-center gap-3 text-center">
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text className="mt-3 text-base text-slate-300">{message}</Text>
          {authStatus === 'unauthenticated' ? (
            <Button variant="default" onPress={() => openHostedLogin({ returnPath: '/app/billing' })} className="mt-4">
              Continue to login
            </Button>
          ) : null}
        </View>
      </View>
    );
  }

  if (companiesQuery.isError) {
    const message = companiesQuery.error instanceof Error ? companiesQuery.error.message : 'Unknown error';
    return (
      <View className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <Card className="max-w-xl border-white/10 bg-white/5 text-white">
          <CardHeader>
            <CardTitle>Unable to load accounts</CardTitle>
            <CardDescription className="text-slate-200">{message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onPress={() => void companiesQuery.refetch()} variant="default">
              Try again
            </Button>
          </CardContent>
        </Card>
      </View>
    );
  }

  const handleOpenCheckout = async (priceId: string) => {
    const response = await createCheckoutMutation.mutateAsync(priceId);
    return response;
  };

  const handleOpenPortal = async () => {
    return await createPortalMutation.mutateAsync();
  };

  const loginOrigin = env.loginOrigin ?? 'https://login.justevery.com';
  const handleOpenOrgConsole = () => {
    if (typeof window !== 'undefined') {
      const redirect = new URL('/', loginOrigin);
      redirect.searchParams.set('return', '/app/billing');
      window.location.assign(redirect.toString());
    }
  };

  const renderAccountSwitcher = () => {
    if (companies.length <= 1) {
      return null;
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>Select an account</CardTitle>
          <CardDescription>Choose which company’s billing data to display.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {companies.map((company) => {
            const isActive = company.id === activeCompanyId;
            return (
              <Pressable
                key={company.id}
                onPress={() => setActiveCompanyId(company.id)}
                className={`rounded-2xl border px-4 py-3 ${
                  isActive ? 'border-slate-900 bg-slate-900/10' : 'border-slate-200 bg-white'
                }`}
              >
                <Text className="text-base font-semibold text-ink">{company.name}</Text>
                <Text className="text-xs text-slate-500">Plan: {company.plan ?? 'Not set'}</Text>
              </Pressable>
            );
          })}
        </CardContent>
      </Card>
    );
  };

  return (
    <View className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-white">
      <View className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle>Org & access management moved</CardTitle>
            <CardDescription>
              Team membership, invites, and API clients now live in the dedicated login workspace. Use the button below to
              jump there when you need to manage org data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="default" onPress={handleOpenOrgConsole} className="w-full md:w-auto">
              Open login.justevery.com
            </Button>
          </CardContent>
        </Card>

        {renderAccountSwitcher()}

        {billingReturnState ? (
          <BillingReturnScreen
            variant={billingReturnState.variant}
            sessionId={billingReturnState.sessionId}
            companyName={activeCompany?.name}
            onManageInStripe={handleOpenPortal}
            isManagePending={createPortalMutation.isPending}
            onBackToBilling={() => window.history.replaceState(null, '', '/app/billing')}
          />
        ) : (
          <BillingScreen
            company={activeCompany}
            subscription={subscriptionQuery.data}
            products={productsQuery.data ?? []}
            invoices={invoicesQuery.data ?? []}
            viewerRole="Owner"
            onOpenCheckout={handleOpenCheckout}
            onOpenPortal={handleOpenPortal}
          />
        )}
      </View>
    </View>
  );
};

export default Dashboard;

