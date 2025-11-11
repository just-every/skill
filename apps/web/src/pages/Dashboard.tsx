import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import AppShell, { type AppNavItem } from '../app/AppShell';
import { useCompanyStore } from '../state/companyStore';
import {
  useAssetsQuery,
  useCompaniesQuery,
  useCompanyById,
  useCreateCheckoutMutation,
  useCreatePortalMutation,
  useInvitesQuery,
  useInvoicesQuery,
  useMembersQuery,
  useProductsQuery,
  useRemoveMemberMutation,
  useResendInviteMutation,
  useSubscriptionQuery,
  useUpdateMemberRoleMutation,
  useUsageQuery,
  useDeleteInviteMutation,
} from '../app/hooks';
import type { Company, Member } from '../app/types';
import OverviewScreen from '../app/screens/OverviewScreen';
import TeamScreen from '../app/screens/TeamScreen';
import BillingScreen from '../app/screens/BillingScreen';
import UsageScreen from '../app/screens/UsageScreen';
import AssetsScreen from '../app/screens/AssetsScreen';
import SettingsScreen from '../app/screens/SettingsScreen';
import { useRouterContext } from '../router/RouterProvider';

const NAV_ITEMS: AppNavItem[] = [
  { key: 'overview', label: 'Overview', description: 'Pulse, stats, quick actions', icon: '🏠' },
  { key: 'team', label: 'Team', description: 'Members, roles, invites', icon: '👥' },
  { key: 'billing', label: 'Billing', description: 'Plan & Stripe status', icon: '💳' },
  { key: 'usage', label: 'Usage', description: 'Requests & storage', icon: '📈' },
  { key: 'assets', label: 'Assets', description: 'R2 uploads', icon: '🗂️' },
  { key: 'settings', label: 'Settings', description: 'Branding & domains', icon: '⚙️' },
];

const resolveSection = (path: string): string => {
  if (!path.startsWith('/app')) {
    return 'overview';
  }
  const [, , maybeSection] = path.split('/');
  if (!maybeSection || maybeSection.trim() === '') {
    return 'overview';
  }
  const section = maybeSection.split('?')[0];
  return NAV_ITEMS.some((item) => item.key === section) ? section : 'overview';
};

const toPath = (segment: string): string => {
  if (segment === 'overview') {
    return '/app/overview';
  }
  return `/app/${segment}`;
};

const Dashboard = () => {
  const { path, navigate } = useRouterContext();
  const { status: authStatus, isAuthenticated, openHostedLogin, session } = useAuth();
  const section = resolveSection(path);

  const companiesQuery = useCompaniesQuery();
  const companies = companiesQuery.data?.accounts ?? [];
  const { activeCompanyId, setActiveCompany } = useCompanyStore();

  useEffect(() => {
    if (companies.length === 0) {
      return;
    }
    if (!activeCompanyId) {
      const preferred = companiesQuery.data?.currentAccountId ?? companies[0].id;
      setActiveCompany(preferred);
    }
  }, [activeCompanyId, companies, companiesQuery.data?.currentAccountId, setActiveCompany]);

  const activeCompany = useCompanyById(companies, activeCompanyId);
  const membersQuery = useMembersQuery(activeCompany?.id, activeCompany?.slug);
  const assetsQuery = useAssetsQuery(activeCompany?.id, activeCompany?.slug);
  const usageQuery = useUsageQuery(activeCompany?.id, activeCompany?.slug);
  const subscriptionQuery = useSubscriptionQuery(activeCompany?.id, activeCompany?.slug);
  const productsQuery = useProductsQuery(activeCompany?.slug);
  const invoicesQuery = useInvoicesQuery(activeCompany?.id, activeCompany?.slug);
  const invitesQuery = useInvitesQuery(activeCompany?.id, activeCompany?.slug);

  // Billing mutations
  const createCheckoutMutation = useCreateCheckoutMutation(activeCompany?.id, activeCompany?.slug);
  const createPortalMutation = useCreatePortalMutation(activeCompany?.id, activeCompany?.slug);
  const updateMemberRoleMutation = useUpdateMemberRoleMutation(activeCompany?.id, activeCompany?.slug);
  const removeMemberMutation = useRemoveMemberMutation(activeCompany?.id, activeCompany?.slug);
  const resendInviteMutation = useResendInviteMutation(activeCompany?.id, activeCompany?.slug);
  const revokeInviteMutation = useDeleteInviteMutation(activeCompany?.id, activeCompany?.slug);

  // Derive viewer role from session user email and members list
  const viewerRole: Member['role'] | undefined = React.useMemo(() => {
    if (!session?.user?.email || !membersQuery.data) {
      return undefined;
    }
    const viewerMember = membersQuery.data.find((m) => m.email === session.user.email);
    return viewerMember?.role;
  }, [session?.user?.email, membersQuery.data]);

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      const next = path.startsWith('/app') ? path : '/app/overview';
      openHostedLogin({ returnPath: next });
    }
  }, [authStatus, openHostedLogin, path]);

  if (authStatus !== 'authenticated' || !isAuthenticated) {
    const message = authStatus === 'checking' ? 'Checking your session…' : 'Redirecting to Better Auth…';
    return (
      <View className={centerClassName}>
        <ActivityIndicator size="large" color="#0f172a" />
        <Text className="mt-3 text-base text-slate-500">{message}</Text>
        {authStatus === 'unauthenticated' ? (
          <Pressable
            onPress={() => openHostedLogin({ returnPath: '/app/overview' })}
            className="rounded-xl bg-ink px-6 py-3"
          >
            <Text className="text-center text-sm font-semibold text-white">Continue to login</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (companiesQuery.isError) {
    const message = companiesQuery.error instanceof Error ? companiesQuery.error.message : 'Unknown error';
    return (
      <View className={centerClassName}>
        <Text className="text-2xl font-bold text-ink">Unable to load company data</Text>
        <Text className="mx-auto mt-3 max-w-[420px] text-center text-sm text-slate-500">
          {message}. Please retry once your session is valid and the Worker can reach Cloudflare D1.
        </Text>
        <Pressable
          onPress={() => void companiesQuery.refetch()}
          className="mt-4 rounded-xl bg-ink px-6 py-3"
        >
          <Text className="text-center text-sm font-semibold text-white">Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (companiesQuery.isLoading && companies.length === 0) {
    return (
      <View className={centerClassName}>
        <ActivityIndicator size="large" color="#0f172a" />
        <Text className="mt-3 text-base text-slate-500">Loading company data…</Text>
      </View>
    );
  }

  const handleNavigate = (segment: string) => {
    navigate(toPath(segment));
  };

  const handleOpenCheckout = async (priceId: string) => {
    return await createCheckoutMutation.mutateAsync(priceId);
  };

  const handleOpenPortal = async () => {
    return await createPortalMutation.mutateAsync();
  };

  const handleChangeRole = async (memberId: string, role: Member['role']) => {
    await updateMemberRoleMutation.mutateAsync({ memberId, role });
  };

  const handleRemoveMember = async (memberId: string) => {
    await removeMemberMutation.mutateAsync(memberId);
  };

  const handleResendInvite = async (inviteId: string) => {
    await resendInviteMutation.mutateAsync(inviteId);
  };

  const handleRevokeInvite = async (inviteId: string) => {
    await revokeInviteMutation.mutateAsync(inviteId);
  };

  const renderScreen = (company?: Company) => {
    switch (section) {
      case 'team':
        return (
          <TeamScreen
            members={membersQuery.data ?? []}
            invites={invitesQuery.data ?? []}
            viewerRole={viewerRole}
            onChangeRole={handleChangeRole}
            onRemoveMember={handleRemoveMember}
            onResendInvite={handleResendInvite}
            onRevokeInvite={handleRevokeInvite}
          />
        );
      case 'billing':
        return (
          <BillingScreen
            company={company}
            subscription={subscriptionQuery.data}
            products={productsQuery.data ?? []}
            invoices={invoicesQuery.data ?? []}
            viewerRole={viewerRole}
            onOpenCheckout={handleOpenCheckout}
            onOpenPortal={handleOpenPortal}
          />
        );
      case 'usage':
        return <UsageScreen points={usageQuery.data ?? []} />;
      case 'assets':
        return <AssetsScreen assets={assetsQuery.data ?? []} />;
      case 'settings':
        return <SettingsScreen company={company} />;
      case 'overview':
      default:
        return (
          <OverviewScreen
            company={company}
            members={membersQuery.data ?? []}
            subscription={subscriptionQuery.data}
            onNavigateToTeam={() => handleNavigate('team')}
          />
        );
    }
  };

  return (
    <AppShell
      navItems={NAV_ITEMS}
      activeItem={section}
      onNavigate={handleNavigate}
      companies={companies}
      isLoadingCompanies={companiesQuery.isLoading}
    >
      {renderScreen(activeCompany)}
    </AppShell>
  );
};

const centerClassName = 'flex-1 min-h-[320px] items-center justify-center gap-3 bg-surface px-6 py-12 text-center';

export default Dashboard;
