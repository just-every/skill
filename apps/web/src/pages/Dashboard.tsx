import React, { useMemo, useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { usePublicEnv } from '../runtimeEnv';
import { useRouterContext } from '../router/RouterProvider';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui';

const Dashboard = () => {
  const { status: authStatus, isAuthenticated, openHostedLogin, session } = useAuth();
  const env = usePublicEnv();
  const { path } = useRouterContext();

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      const next = path.startsWith('/app') ? path : '/app';
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
            <Button variant="default" onPress={() => openHostedLogin({ returnPath: '/app' })} className="mt-4">
              Continue to login
            </Button>
          ) : null}
        </View>
      </View>
    );
  }

  const loginUrl = useMemo(() => {
    try {
      return new URL(env.loginOrigin);
    } catch {
      return new URL('https://login.justevery.com');
    }
  }, [env.loginOrigin]);

  const managementUrl = `${loginUrl.origin}/`; // login app decides destination

  const handleOpenLogin = () => {
    if (typeof window !== 'undefined') {
      window.location.assign(`${managementUrl}?return=${encodeURIComponent('/app')}`);
    }
  };

  const userName = session?.user?.name ?? session?.user?.email ?? 'your account';

  return (
    <View className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-white">
      <View className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <View className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_30px_60px_rgba(15,23,42,0.45)]">
          <Text className="text-xs uppercase tracking-[0.4em] text-slate-300">Welcome back</Text>
          <Text className="mt-2 text-4xl font-bold text-white">{userName}</Text>
          <Text className="mt-3 text-base text-slate-200">
            Organization, member, and billing management now live entirely inside the dedicated login worker.
            Use the button below to jump into the shared console whenever you need to invite teammates, change roles,
            or manage API clients.
          </Text>
          <Button className="mt-6 w-full md:w-auto" size="lg" onPress={handleOpenLogin}>
            Open login.justevery.com
          </Button>
        </View>

        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle>What moved?</CardTitle>
            <CardDescription>
              Org CRUD, invites, clients, and billing APIs are now canonical in the login repository. This starter worker
              focuses on session bridging, marketing assets, and runtime config injection.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <View className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <Text className="text-sm font-semibold text-white">Org & team management</Text>
              <Text className="mt-1 text-sm text-slate-200">
                Use the login workspace to create orgs, issue invites, and manage member roles. The `/api/accounts/*`
                routes have been removed from this worker.
              </Text>
            </View>
            <View className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <Text className="text-sm font-semibold text-white">Billing workflows</Text>
              <Text className="mt-1 text-sm text-slate-200">
                Checkout, customer portal, and invoice APIs are emitted by the login worker. Keep using
                `/api/stripe/products` here for marketing surfaces, but run all mutations through the login app.
              </Text>
            </View>
            <View className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <Text className="text-sm font-semibold text-white">Local testing</Text>
              <Text className="mt-1 text-sm text-slate-200">
                When building locally, run `pnpm run dev:worker` for this stack plus the login repo’s dev server so the
                redirect button above always lands on your authentication environment.
              </Text>
            </View>
          </CardContent>
        </Card>
      </View>
    </View>
  );
};

export default Dashboard;

