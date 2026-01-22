import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest';

import Dashboard from '../Dashboard';
import { useCompanyStore } from '../../state/companyStore';

const companies = [
  { id: 'org-1', slug: 'acme', name: 'Acme', plan: 'Founders' },
];

const companiesQuery = {
  data: { accounts: companies, currentAccountId: 'org-1' },
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
};

const openPopup = vi.fn();
let dashboardPopupOptions: any;
let currentPath = '/app/team';
const navigateMock = vi.fn();

vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'authenticated',
    isAuthenticated: true,
    openHostedLogin: vi.fn(),
    session: { user: { name: 'Demo User', email: 'demo@example.com' } },
    loginOrigin: 'https://login.test',
    refresh: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../../router/RouterProvider', () => ({
  useRouterContext: () => ({ path: currentPath, navigate: navigateMock }),
}));

vi.mock('../../profile/useJustEveryProfilePopup', () => {
  const noopPopup = {
    open: vi.fn(),
    close: vi.fn(),
    setSection: vi.fn(),
    refreshSession: vi.fn(),
    refreshOrgs: vi.fn(),
    isReady: true,
  };
  return {
    useJustEveryProfilePopup: (options: any) => {
      if (options.returnUrl) {
        return noopPopup;
      }
      dashboardPopupOptions = options;
      return {
        open: openPopup,
        close: vi.fn(),
        setSection: vi.fn(),
        refreshSession: vi.fn(),
        refreshOrgs: vi.fn(),
        isReady: true,
      };
    },
  };
});

vi.mock('../../app/hooks', () => ({
  useCompaniesQuery: () => companiesQuery,
  useCompanyById: () => companies[0],
  useAssetsQuery: () => ({ data: [] }),
  useUsageQuery: () => ({ data: [] }),
  useSubscriptionQuery: () => ({ data: undefined }),
  useMembersQuery: () => ({ data: [] }),
  useDesignRunsQuery: () => ({ data: [] }),
  useDesignRunDetailQuery: () => ({ data: undefined }),
  useCreateDesignRunMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteDesignRunMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useProductsQuery: () => ({ data: [] }),
  useInvitesQuery: () => ({ data: [] }),
  useInvoicesQuery: () => ({ data: [] }),
  useCreateCheckoutMutation: () => ({ mutateAsync: vi.fn() }),
  useCreatePortalMutation: () => ({ mutateAsync: vi.fn() }),
  useRemoveMemberMutation: () => ({ mutateAsync: vi.fn() }),
  useResendInviteMutation: () => ({ mutateAsync: vi.fn() }),
  useUpdateMemberRoleMutation: () => ({ mutateAsync: vi.fn() }),
  useUpdateMemberNameMutation: () => ({ mutateAsync: vi.fn() }),
  useDeleteInviteMutation: () => ({ mutateAsync: vi.fn() }),
  useSwitchCompanyMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../api/client', () => ({
  useApiClient: () => ({ post: vi.fn() }),
}));

vi.mock('../../lib/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => false,
}));

vi.mock('../../app/components/InviteModal', () => ({
  __esModule: true,
  default: () => null,
}));

describe('Dashboard profile popup integration', () => {
  beforeEach(() => {
    currentPath = '/app/team';
    navigateMock.mockReset();
    openPopup.mockReset();
    companiesQuery.refetch.mockReset();
    dashboardPopupOptions = undefined;
    useCompanyStore.setState({ activeCompanyId: 'org-1' });
  });

  it('auto-opens the hosted popup for Team and navigates back when the popup closes', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(openPopup).toHaveBeenCalledWith({ section: 'organizations', organizationId: 'org-1' });
    });

    act(() => {
      dashboardPopupOptions?.onClose?.();
    });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/app/overview');
    });
  });

  it('retries opening the popup via the Retry button', async () => {
    currentPath = '/app/settings';
    render(<Dashboard />);

    await screen.findByText(/Opening settings/i);

    openPopup.mockClear();

    fireEvent.click(screen.getByText('Retry'));
    expect(openPopup).toHaveBeenCalledWith({ section: 'account', organizationId: 'org-1' });
  });
});
