import { render, fireEvent, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { faHouse } from '@fortawesome/pro-solid-svg-icons';

import AppShell from '../AppShell';
import { useCompanyStore } from '../../state/companyStore';

const openPopup = vi.fn();
let currentPath = '/app/overview';

vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'authenticated',
    isAuthenticated: true,
    session: { user: { name: 'Demo User', email: 'demo@example.com' } },
    loginOrigin: 'https://login.test',
    refresh: vi.fn(),
    signOut: vi.fn(),
    openHostedLogin: vi.fn(),
  }),
}));

vi.mock('../../router/RouterProvider', () => ({
  useRouterContext: () => ({ path: currentPath, navigate: vi.fn() }),
}));

vi.mock('../../profile/useJustEveryProfilePopup', () => ({
  useJustEveryProfilePopup: () => ({
    open: openPopup,
    close: vi.fn(),
    setSection: vi.fn(),
    refreshSession: vi.fn(),
    refreshOrgs: vi.fn(),
    isReady: true,
  }),
}));

vi.mock('../hooks', () => ({
  useSwitchCompanyMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../components/InviteModal', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('../../api/client', () => ({
  useApiClient: () => ({ post: vi.fn() }),
}));

vi.mock('../../lib/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => false,
}));

describe('AppShell account menu popup integration', () => {
  beforeEach(() => {
    openPopup.mockReset();
    useCompanyStore.setState({ activeCompanyId: 'org-1' });
  });

  const navItems = [
    { key: 'overview', label: 'Overview', description: 'desc', icon: faHouse },
  ];

  it('opens the hosted popup from the Manage login profile entry', () => {
    render(
      <AppShell
        navItems={navItems}
        activeItem="overview"
        onNavigate={vi.fn()}
        companies={[{ id: 'org-1', name: 'Acme', plan: 'Founders', slug: 'acme' }]}
        isLoadingCompanies={false}
        onRefreshCompanies={vi.fn()}
      >
        <div />
      </AppShell>
    );

    fireEvent.click(screen.getByLabelText('Account options'));
    fireEvent.click(screen.getByText('Manage login profile'));

    expect(openPopup).toHaveBeenCalledWith({ section: 'account' });
  });
});
