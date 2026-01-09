import React, { useCallback, useEffect } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { faChartSimple, faCreditCard, faFolderTree, faGear, faHouse, faPalette, faUsers } from '@fortawesome/pro-solid-svg-icons';

import { useAuth } from '../auth/AuthProvider';
import AppShell, { type AppNavItem } from '../app/AppShell';
import { useCompanyStore } from '../state/companyStore';
import {
  useAssetsQuery,
  useCompaniesQuery,
  useCompanyById,
  useCreateCheckoutMutation,
  useCreateDesignRunMutation,
  useCreatePortalMutation,
  useDeleteDesignRunMutation,
  useDeleteInviteMutation,
  useDesignRunDetailQuery,
  useDesignRunsQuery,
  useInvitesQuery,
  useInvoicesQuery,
  useMembersQuery,
  useProductsQuery,
  useRemoveMemberMutation,
  useResendInviteMutation,
  useSubscriptionQuery,
  useUpdateMemberNameMutation,
  useUpdateMemberRoleMutation,
  useUsageQuery,
} from '../app/hooks';
import type { Company, DesignRunCreateInput, Member } from '../app/types';
import OverviewScreen from '../app/screens/OverviewScreen';
import BillingReturnScreen from '../app/screens/BillingReturnScreen';
import UsageScreen from '../app/screens/UsageScreen';
import AssetsScreen from '../app/screens/AssetsScreen';
import DesignCreateScreen from '../app/screens/DesignCreateScreen';
import DesignListScreen from '../app/screens/DesignListScreen';
import DesignDetailScreen from '../app/screens/DesignDetailScreen';
import { useJustEveryProfilePopup } from '../profile/useJustEveryProfilePopup';
import { useRouterContext } from '../router/RouterProvider';

const NAV_ITEMS: AppNavItem[] = [
  { key: 'overview', label: 'Overview', description: 'Pulse, stats, quick actions', icon: faHouse },
  { key: 'design', label: 'Design', description: 'AI-generated designs', icon: faPalette },
  { key: 'team', label: 'Team', description: 'Members, roles, invites', icon: faUsers },
  { key: 'billing', label: 'Billing', description: 'Plan & Stripe status', icon: faCreditCard },
  { key: 'usage', label: 'Usage', description: 'Requests & storage', icon: faChartSimple },
  { key: 'assets', label: 'Assets', description: 'R2 uploads', icon: faFolderTree },
  { key: 'settings', label: 'Settings', description: 'Branding & domains', icon: faGear },
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

type DesignRoute =
  | { view: 'list' }
  | { view: 'create' }
  | { view: 'detail'; runId: string };

const stripQueryAndHash = (path: string): string => {
  const queryIndex = path.indexOf('?');
  const hashIndex = path.indexOf('#');
  const cut = [queryIndex, hashIndex].filter((idx) => idx >= 0).sort((a, b) => a - b)[0];
  if (typeof cut === 'number') {
    return path.slice(0, cut);
  }
  return path;
};

const parseDesignRoute = (path: string): DesignRoute => {
  const cleaned = stripQueryAndHash(path);
  const segments = cleaned.split('/').filter(Boolean);
  const appIndex = segments.indexOf('app');
  const appSegments = appIndex >= 0 ? segments.slice(appIndex) : segments;

  if (appSegments[0] !== 'app' || appSegments[1] !== 'design') {
    return { view: 'list' };
  }
  if (appSegments.length === 2) {
    return { view: 'list' };
  }

  const sub = appSegments[2];
  if (sub === 'create') {
    return { view: 'create' };
  }
  if (sub === 'runs' && appSegments[3]) {
    return { view: 'detail', runId: appSegments[3] };
  }

  return { view: 'list' };
};

const parseBillingReturnState = (path: string): { variant: 'success' | 'cancel'; sessionId: string | null } | null => {
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

const toPath = (segment: string): string => {
  if (segment === 'overview') {
    return '/app/overview';
  }
  return `/app/${segment}`;
};

const toDesignListPath = () => '/app/design';
const toDesignCreatePath = () => '/app/design/create';
const toDesignRunPath = (runId: string) => `/app/design/runs/${encodeURIComponent(runId)}`;

const Dashboard = () => {
  const { path, navigate } = useRouterContext();
  const { status: authStatus, isAuthenticated, openHostedLogin, session, loginOrigin } = useAuth();
  const section = resolveSection(path);
  const billingReturnState = React.useMemo(() => parseBillingReturnState(path), [path]);
  const designRoute = React.useMemo(() => parseDesignRoute(path), [path]);

  useEffect(() => {
    if (path === '/app' || path === '/app/') {
      navigate('/app/overview', { replace: true });
    }
  }, [navigate, path]);

  const companiesQuery = useCompaniesQuery();
  const companies = companiesQuery.data?.accounts ?? [];
  const { activeCompanyId, setActiveCompany } = useCompanyStore();

  useEffect(() => {
    if (companies.length === 0) {
      return;
    }
    const hasActiveCompany = Boolean(activeCompanyId && companies.some((company) => company.id === activeCompanyId));
    if (hasActiveCompany) {
      return;
    }

    const preferred = companiesQuery.data?.currentAccountId ?? companies[0].id;
    if (preferred) {
      setActiveCompany(preferred);
    }
  }, [activeCompanyId, companies, companiesQuery.data?.currentAccountId, setActiveCompany]);

  const activeCompany = useCompanyById(companies, activeCompanyId);
  const activeCompanyForQueries = companiesQuery.isPlaceholderData ? undefined : activeCompany;
  const assetsQuery = useAssetsQuery(activeCompanyForQueries?.id, activeCompanyForQueries?.slug);
  const usageQuery = useUsageQuery(activeCompanyForQueries?.id, activeCompanyForQueries?.slug);
  const subscriptionQuery = useSubscriptionQuery(activeCompanyForQueries?.id, activeCompanyForQueries?.slug);

  // Design runs state and queries
  const designRunsQuery = useDesignRunsQuery(activeCompanyForQueries?.id, activeCompanyForQueries?.slug);
  const designRunDetailQuery = useDesignRunDetailQuery(
    activeCompanyForQueries?.id,
    activeCompanyForQueries?.slug,
    designRoute.view === 'detail' ? designRoute.runId : undefined
  );
  const createDesignRunMutation = useCreateDesignRunMutation(
    activeCompanyForQueries?.id,
    activeCompanyForQueries?.slug
  );
  const deleteDesignRunMutation = useDeleteDesignRunMutation(
    activeCompanyForQueries?.id,
    activeCompanyForQueries?.slug
  );
  const [deletingRunId, setDeletingRunId] = React.useState<string | null>(null);

  const handleNavigate = useCallback(
    (segment: string) => {
      navigate(toPath(segment));
    },
    [navigate]
  );

  const handleCreateDesignRun = useCallback(async (input: DesignRunCreateInput) => {
    try {
      const result = await createDesignRunMutation.mutateAsync(input);
      navigate(toDesignRunPath(result.run.id));
    } catch (error) {
      console.error('Failed to create design run:', error);
      throw error;
    }
  }, [createDesignRunMutation, navigate]);

  const handleViewDesignRun = useCallback((runId: string) => {
    navigate(toDesignRunPath(runId));
  }, [navigate]);

  const handleDeleteDesignRun = useCallback(async (runId: string) => {
    setDeletingRunId(runId);
    try {
      await deleteDesignRunMutation.mutateAsync(runId);
    } catch (error) {
      console.error('Failed to delete design run:', error);
    } finally {
      setDeletingRunId(null);
    }
  }, [deleteDesignRunMutation]);

  const handleBackToDesignList = useCallback(() => {
    navigate(toDesignListPath());
  }, [navigate]);

  const redirectSection = React.useMemo(() => {
    if (section === 'team') return 'organizations';
    if (section === 'billing') return 'billing';
    if (section === 'settings') return 'account';
    return null;
  }, [section]);

  const refetchCompanies = companiesQuery.refetch;

  const handlePopupReady = useCallback(() => {
    void refetchCompanies();
  }, [refetchCompanies]);

  const handlePopupOrgChange = useCallback(
    (payload: { organizationId?: string }) => {
      if (payload.organizationId) {
        setActiveCompany(payload.organizationId);
        void refetchCompanies();
      }
    },
    [refetchCompanies, setActiveCompany]
  );

  const handlePopupSessionLogout = useCallback(() => {
    openHostedLogin({ returnPath: '/app/overview' });
  }, [openHostedLogin]);

  const handlePopupClose = useCallback(() => {
    if (redirectSection) {
      handleNavigate('overview');
    }
  }, [handleNavigate, redirectSection]);

  const { open: openProfilePopup } = useJustEveryProfilePopup({
    baseUrl: loginOrigin,
    defaultSection: 'account',
    defaultOrganizationId: activeCompanyForQueries?.id,
    onReady: handlePopupReady,
    onOrganizationChange: handlePopupOrgChange,
    onSessionLogout: handlePopupSessionLogout,
    onClose: handlePopupClose,
  });

  const requestProfilePopup = useCallback(
    (payload: { section?: string; organizationId?: string } | undefined, source: string) => {
      console.info('[profile-popup:Dashboard] open', source, payload);
      openProfilePopup(payload);
    },
    [openProfilePopup]
  );

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      const next = path.startsWith('/app') ? path : '/app/overview';
      openHostedLogin({ returnPath: next });
    }
  }, [authStatus, openHostedLogin, path]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !isAuthenticated || !redirectSection) {
      return;
    }
    requestProfilePopup({ section: redirectSection as any, organizationId: activeCompanyForQueries?.id }, `route:${section}`);
  }, [activeCompanyForQueries?.id, authStatus, isAuthenticated, redirectSection, requestProfilePopup, section]);

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
        <Text className="text-2xl font-bold text-ink">Unable to load organization data</Text>
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
        <Text className="mt-3 text-base text-slate-500">Loading organization data…</Text>
      </View>
    );
  }

  const renderScreen = (company?: Company) => {
    if (billingReturnState) {
      return (
        <BillingReturnScreen
          variant={billingReturnState.variant}
          sessionId={billingReturnState.sessionId}
          companyName={company?.name}
          onManageInStripe={() => requestProfilePopup({ section: 'billing', organizationId: company?.id }, 'billing:return-screen')}
          isManagePending={false}
          onBackToBilling={() => handleNavigate('billing')}
        />
      );
    }

    if (redirectSection) {
      return (
        <View className={centerClassName}>
          <ActivityIndicator size="large" color="#0f172a" />
          <Text className="mt-3 text-base text-slate-500">Opening {section} in your account profile…</Text>
          <Pressable
            className="mt-4 rounded-xl bg-ink px-6 py-3"
            onPress={() => requestProfilePopup({ section: redirectSection as any, organizationId: company?.id }, 'redirect:retry')}
          >
            <Text className="text-center text-sm font-semibold text-white">Retry</Text>
          </Pressable>
          <Pressable
            className="mt-2"
            onPress={() => handleNavigate('overview')}
          >
            <Text className="text-center text-sm text-slate-500">Back to overview</Text>
          </Pressable>
        </View>
      );
    }

    switch (section) {
      case 'design':
        if (designRoute.view === 'create') {
          return (
            <DesignCreateScreen
              onSubmit={handleCreateDesignRun}
              isSubmitting={createDesignRunMutation.isPending}
              error={createDesignRunMutation.error instanceof Error ? createDesignRunMutation.error.message : null}
            />
          );
        }
        if (designRoute.view === 'detail') {
          return (
            <DesignDetailScreen
              run={designRunDetailQuery.data}
              isLoading={designRunDetailQuery.isLoading}
              error={designRunDetailQuery.error instanceof Error ? designRunDetailQuery.error.message : null}
              onBack={handleBackToDesignList}
            />
          );
        }
        return (
          <DesignListScreen
            runs={designRunsQuery.data ?? []}
            isLoading={designRunsQuery.isLoading}
            onCreateNew={() => navigate(toDesignCreatePath())}
            onViewRun={handleViewDesignRun}
            onDeleteRun={handleDeleteDesignRun}
            isDeletingRun={deletingRunId}
          />
        );
      case 'usage':
        return <UsageScreen points={usageQuery.data ?? []} />;
      case 'assets':
        return <AssetsScreen assets={assetsQuery.data ?? []} />;
      case 'overview':
      default:
        return (
          <OverviewScreen
            company={company}
            members={[]}
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
      onRefreshCompanies={() => void companiesQuery.refetch()}
    >
      {renderScreen(activeCompany)}
    </AppShell>
  );
};

const centerClassName = 'flex-1 min-h-[320px] items-center justify-center gap-3 bg-surface px-6 py-12 text-center';

export default Dashboard;
