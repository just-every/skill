import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import AppShell, { type AppNavItem } from '../app/AppShell';
import { useCompanyStore } from '../state/companyStore';
import {
  useAssetsQuery,
  useCompaniesQuery,
  useCompanyById,
  useMembersQuery,
  useSubscriptionQuery,
  useUsageQuery,
} from '../app/hooks';
import type { Company } from '../app/types';
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
  const { status: authStatus, isAuthenticated, openHostedLogin } = useAuth();
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

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      const next = path.startsWith('/app') ? path : '/app/overview';
      openHostedLogin({ returnPath: next });
    }
  }, [authStatus, openHostedLogin, path]);

  if (authStatus !== 'authenticated' || !isAuthenticated) {
    const message = authStatus === 'checking' ? 'Checking your session…' : 'Redirecting to Better Auth…';
    return (
      <View style={centerStyles}>
        <ActivityIndicator size="large" color="#0f172a" />
        <Text style={{ color: '#475569', marginTop: 12 }}>{message}</Text>
        {authStatus === 'unauthenticated' ? (
          <Pressable onPress={() => openHostedLogin({ returnPath: '/app/overview' })}>
            <Text style={{ color: '#38bdf8', fontWeight: '600' }}>Continue to login</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (companiesQuery.isError) {
    const message = companiesQuery.error instanceof Error ? companiesQuery.error.message : 'Unknown error';
    return (
      <View style={centerStyles}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: '#0f172a' }}>Unable to load company data</Text>
        <Text style={{ color: '#475569', marginVertical: 12, maxWidth: 420, textAlign: 'center' }}>
          {message}. Please retry once your session is valid and the Worker can reach Cloudflare D1.
        </Text>
        <Pressable
          onPress={() => void companiesQuery.refetch()}
          style={{ backgroundColor: '#0f172a', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ color: '#f8fafc', fontWeight: '700' }}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (companiesQuery.isLoading && companies.length === 0) {
    return (
      <View style={centerStyles}>
        <ActivityIndicator size="large" color="#0f172a" />
        <Text style={{ color: '#475569', marginTop: 12 }}>Loading company data…</Text>
      </View>
    );
  }

  const handleNavigate = (segment: string) => {
    navigate(toPath(segment));
  };

  const renderScreen = (company?: Company) => {
    switch (section) {
      case 'team':
        return <TeamScreen members={membersQuery.data ?? []} />;
      case 'billing':
        return <BillingScreen company={company} subscription={subscriptionQuery.data} />;
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

const centerStyles = {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#f8fafc',
  gap: 12,
  padding: 24,
} as const;

export default Dashboard;
