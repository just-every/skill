import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faAngleDown, faArrowRightFromBracket, faBars, faEnvelope, faIdBadge, faUserPlus, faXmark } from '@fortawesome/pro-solid-svg-icons';

import { useCompanyStore } from '../state/companyStore';
import type { Company, InviteDraft } from './types';
import { useApiClient } from '../api/client';
import { useSwitchCompanyMutation } from './hooks';
import InviteModal from './components/InviteModal';
import { Button } from '../components/ui';
import { Logo } from '../components/Logo';
import { cn } from '../lib/cn';
import { useAuth } from '../auth/AuthProvider';
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion';
import useProfilePopup from '../profile/useProfilePopup';
import { DEFAULT_STARFIELD_VARIANT } from './components/Starfield';
import { useRouterContext } from '../router/RouterProvider';

export type AppNavItem = {
  key: string;
  label: string;
  description: string;
  icon: IconDefinition;
};

type AppShellProps = {
  readonly navItems: AppNavItem[];
  readonly activeItem: string;
  readonly onNavigate: (key: string) => void;
  readonly companies: Company[];
  readonly isLoadingCompanies: boolean;
  readonly children?: ReactNode;
};

const STARFIELD_MICRO_EVENT_FREQ = 0.003;

const AppShell = ({ navItems, activeItem, onNavigate, companies, isLoadingCompanies, children }: AppShellProps) => {
  const { activeCompanyId, setActiveCompany } = useCompanyStore();
  const api = useApiClient();
  const [openInvite, setOpenInvite] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [switcherHover, setSwitcherHover] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingCompanyId, setPendingCompanyId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const { session, signOut, loginOrigin, refresh } = useAuth();
  const { path } = useRouterContext();
  const switchCompanyMutation = useSwitchCompanyMutation();
  const prefersReducedMotion = usePrefersReducedMotion();
  const sidebarContainerRef = useRef<HTMLDivElement | null>(null);
  const [starfieldModule, setStarfieldModule] = useState<null | typeof import('./components/Starfield')>(null);
  const navInteractionLevel = isMobileMenuOpen ? 1 : 0;
  const depthCurve = useMemo(() => (depth: number) => 0.25 + depth * 0.75, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setStarfieldModule(null);
      return undefined;
    }
    let cancelled = false;
    import('./components/Starfield').then((starfield) => {
      if (!cancelled) {
        setStarfieldModule(starfield);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCompany = useMemo(() => {
    if (!companies || companies.length === 0) {
      return undefined;
    }
    const fallback = companies[0];
    if (!activeCompanyId) {
      return fallback;
    }
    return companies.find((company) => company.id === activeCompanyId) ?? fallback;
  }, [activeCompanyId, companies]);

  const profileReturnUrl = typeof window !== 'undefined' ? window.location.origin + path : undefined;

  const profilePopup = useProfilePopup({
    baseUrl: loginOrigin,
    defaultSection: 'account',
    defaultOrganizationId: activeCompany?.id,
    returnUrl: profileReturnUrl,
    onReady: handlePopupReady,
    onOrganizationChange: handlePopupOrgChange,
    onSessionLogout: handlePopupLogout,
    onClose: () => setAccountMenuOpen(false),
  });

  const { Host: ProfilePopupHostElement, open: openProfilePopup } = profilePopup;

  const handleCompanyChange = useCallback(
    async (company: Company) => {
      if (!company.slug || switchCompanyMutation.isPending) {
        return;
      }
      setPendingCompanyId(company.id);
      setSwitchError(null);
      try {
        await switchCompanyMutation.mutateAsync({ slug: company.slug });
        setActiveCompany(company.id);
        setShowSwitcher(false);
        setSwitcherHover(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to switch company';
        setSwitchError(message);
      } finally {
        setPendingCompanyId(null);
      }
    },
    [setActiveCompany, setShowSwitcher, setSwitcherHover, switchCompanyMutation]
  );

  const handlePopupOrgChange = useCallback(
    (payload: unknown) => {
      const org =
        payload && typeof payload === 'object' && 'organization' in payload
          ? (payload as { organization?: { id?: string } }).organization
          : undefined;
      if (org?.id) {
        setActiveCompany(org.id);
      }
      void companiesQuery.refetch();
    },
    [companiesQuery, setActiveCompany]
  );

  const handlePopupLogout = useCallback(async () => {
    await signOut({ returnUrl: typeof window !== 'undefined' ? window.location.origin : undefined });
    if (typeof window !== 'undefined') {
      window.location.assign('/');
    }
  }, [signOut]);

  const handlePopupReady = useCallback(() => {
    void refresh();
    void companiesQuery.refetch();
  }, [companiesQuery, refresh]);

  const handleInviteSubmit = async (draft: InviteDraft) => {
    if (!activeCompany?.slug) {
      throw new Error('Select a company before inviting teammates.');
    }
    await api.post(`/api/accounts/${activeCompany.slug}/invites`, {
      email: draft.email,
      role: draft.role,
      name: draft.name,
    });
  };

  const displayName = useMemo(() => {
    if (session?.user?.name) {
      return session.user.name;
    }
    if (session?.user?.email) {
      return session.user.email.split('@')[0];
    }
    return 'Account';
  }, [session?.user?.email, session?.user?.name]);

  const userEmail = session?.user?.email ?? 'unknown@justevery.com';

  const initials = useMemo(() => {
    return displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((piece) => piece[0]?.toUpperCase())
      .join('') || 'JA';
  }, [displayName]);

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) {
      return;
    }
    setIsSigningOut(true);
    try {
      await api.post<{ ok: boolean }>('/api/session/logout', {});
    } catch (error) {
      console.warn('Failed to clear worker session', error);
    }
    try {
      await signOut({ returnUrl: typeof window !== 'undefined' ? window.location.origin : undefined });
    } catch (error) {
      console.warn('Sign out failed', error);
    } finally {
      setAccountMenuOpen(false);
      if (typeof window !== 'undefined') {
        window.location.assign('/');
      }
      setIsSigningOut(false);
    }
  }, [api, isSigningOut, setAccountMenuOpen, signOut]);

  const closeMenus = useCallback(() => {
    setShowSwitcher(false);
    setSwitcherHover(false);
    setAccountMenuOpen(false);
    setMobileMenuOpen(false);
  }, []);

  const handleNavPress = useCallback(
    (key: string) => {
      closeMenus();
      onNavigate(key);
    },
    [closeMenus, onNavigate]
  );

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }
    const handleGlobalPress = (event: Event) => {
      const target = event.target as Node;
      if (showSwitcher && switcherRef.current && !switcherRef.current.contains(target)) {
        setShowSwitcher(false);
        setSwitcherHover(false);
      }
      if (accountMenuOpen && accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountMenuOpen(false);
      }
    };
    const handleGlobalKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenus();
      }
    };
    document.addEventListener('mousedown', handleGlobalPress);
    document.addEventListener('touchstart', handleGlobalPress);
    document.addEventListener('keydown', handleGlobalKeydown);
    return () => {
      document.removeEventListener('mousedown', handleGlobalPress);
      document.removeEventListener('touchstart', handleGlobalPress);
      document.removeEventListener('keydown', handleGlobalKeydown);
    };
  }, [accountMenuOpen, closeMenus, showSwitcher]);

  const StarfieldComponent = starfieldModule?.Starfield;

  const renderAccountMenu = useCallback(() => (
    <View className="mt-4 space-y-2">
      <div className="relative" ref={accountMenuRef}>
        <Pressable
          testID="account-menu-toggle"
          onPress={() => setAccountMenuOpen((prev) => !prev)}
          accessibilityRole="button"
          accessibilityLabel="Account options"
          aria-expanded={accountMenuOpen}
          aria-haspopup="menu"
          className="flex flex-row items-center gap-2 rounded-full border border-slate-700 bg-slate-950/80 px-3 py-2"
        >
          <View className="h-9 w-9 items-center justify-center rounded-full bg-ink">
            <Text className="text-sm font-semibold text-white">{initials}</Text>
          </View>
          <Text className="text-sm font-semibold text-white">{displayName}</Text>
          <FontAwesomeIcon icon={faAngleDown} size={12} color="#f8fafc" />
        </Pressable>
        {accountMenuOpen && (
          <View
            accessibilityRole="menu"
            aria-label="Account options"
            testID="account-menu"
            className="absolute right-0 bottom-full mb-2 min-w-[260px] rounded-2xl border border-slate-800 bg-slate-950/90 p-4 shadow-sm"
          >
            <Text className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Signed in as</Text>
            <View className="mt-1 flex-row items-center gap-2">
              <FontAwesomeIcon icon={faEnvelope} size={11} color="#94a3b8" />
              <Text className="text-sm font-semibold text-white" numberOfLines={1} ellipsizeMode="tail">
                {userEmail}
              </Text>
            </View>
            <View className="mt-4 space-y-2">
              <Text className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Current company</Text>
              <div
                className="relative"
                ref={switcherRef}
                onMouseEnter={() => setSwitcherHover(true)}
                onMouseLeave={() => setSwitcherHover(false)}
                onFocus={() => setSwitcherHover(true)}
                onBlur={() => setSwitcherHover(false)}
              >
                <Pressable
                  testID="company-switcher-toggle"
                  onPress={() => {
                    setShowSwitcher((prev) => !prev);
                    setSwitcherHover(false);
                  }}
                  className="rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-3 text-left text-sm font-semibold text-white"
                  accessibilityRole="button"
                  accessibilityLabel="Select company"
                  aria-expanded={showSwitcher || switcherHover}
                  aria-haspopup="menu"
                >
                  <Text className="text-base font-semibold text-white">
                    {activeCompany?.name ?? 'Select company'}
                  </Text>
                  <Text className="text-xs text-slate-400">{activeCompany?.plan ?? '—'}</Text>
                </Pressable>
                {(showSwitcher || switcherHover) && (
                  <View
                    accessibilityRole="menu"
                    aria-label="Company switcher"
                    testID="company-switcher-menu"
                    className="absolute left-0 top-full mt-2 w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/95 p-1 shadow-sm"
                  >
                    {companies.map((company) => {
                      const isActiveCompany = company.id === activeCompany?.id;
                      const isPending = pendingCompanyId === company.id && switchCompanyMutation.isPending;
                      return (
                        <Pressable
                          key={company.id}
                          onPress={() => void handleCompanyChange(company)}
                          className={cn(
                            'rounded-xl px-3 py-2 transition-colors',
                            isActiveCompany ? 'bg-white/10' : 'hover:bg-white/5',
                            switchCompanyMutation.isPending ? 'opacity-60' : undefined
                          )}
                          accessibilityRole="menuitemradio"
                          accessibilityState={{
                            selected: company.id === activeCompany?.id,
                            busy: pendingCompanyId === company.id && switchCompanyMutation.isPending,
                          }}
                          disabled={switchCompanyMutation.isPending}
                        >
                          <Text className={cn('text-sm font-semibold', isActiveCompany ? 'text-white' : 'text-slate-100')}>
                            {isPending ? 'Switching…' : company.name}
                          </Text>
                          <Text className={cn('text-[11px]', isActiveCompany ? 'text-slate-300' : 'text-slate-400')}>
                            {isPending ? 'Hold tight…' : company.plan}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </div>
              {switchError ? <Text className="text-[11px] text-rose-300">{switchError}</Text> : null}
            </View>
            <Pressable
              onPress={() => {
                setAccountMenuOpen(false);
                setMobileMenuOpen(false);
                openProfilePopup({ section: 'account' });
              }}
              accessibilityRole="menuitem"
              className="mt-4 flex flex-row items-center justify-center gap-2 rounded-2xl border border-slate-700 px-4 py-2"
            >
              <FontAwesomeIcon icon={faIdBadge} size={14} color="#f8fafc" />
              <Text className="text-sm font-semibold text-white">Manage login profile</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setOpenInvite(true);
                setAccountMenuOpen(false);
                setMobileMenuOpen(false);
              }}
              accessibilityRole="menuitem"
              className="mt-3 flex flex-row items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-2"
            >
              <FontAwesomeIcon icon={faUserPlus} size={14} color="#f8fafc" />
              <Text className="text-sm font-semibold text-white">Invite teammates</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleSignOut()}
              accessibilityRole="menuitem"
              className="mt-3 flex flex-row items-center justify-center gap-2 rounded-2xl border border-slate-700 px-4 py-2"
              disabled={isSigningOut}
            >
              <FontAwesomeIcon icon={faArrowRightFromBracket} size={14} color="#94a3b8" />
              <Text className="text-sm font-semibold text-white">
                {isSigningOut ? 'Signing out…' : 'Logout'}
              </Text>
            </Pressable>
          </View>
        )}
      </div>
    </View>
  ), [
    accountMenuOpen,
    activeCompany,
    companies,
    displayName,
    handleCompanyChange,
    handleSignOut,
    initials,
    isSigningOut,
    pendingCompanyId,
    setShowSwitcher,
    setSwitcherHover,
    setAccountMenuOpen,
    setMobileMenuOpen,
    setOpenInvite,
    showSwitcher,
    switchCompanyMutation.isPending,
    switchError,
    switcherHover,
    switcherRef,
    userEmail,
    accountMenuRef,
    openProfilePopup,
  ]);

  return (
    <View className="relative flex min-h-screen flex-row bg-surface">
      <View className="hidden w-72 border-r border-slate-900/30 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white lg:flex">
        <Sidebar
          sidebarContainerRef={sidebarContainerRef}
          StarfieldComponent={StarfieldComponent}
          prefersReducedMotion={prefersReducedMotion}
          navInteractionLevel={navInteractionLevel}
          depthCurve={depthCurve}
          navItems={navItems}
          activeItem={activeItem}
          handleNavPress={handleNavPress}
          renderAccountMenu={renderAccountMenu}
          microEventFrequency={STARFIELD_MICRO_EVENT_FREQ}
        />
      </View>
      <View className="flex min-h-screen flex-1 flex-col bg-surface">
        <View className="relative z-50 flex flex-row items-center justify-between border-b border-slate-900/40 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-4 text-white lg:hidden">
          <Logo size={28} color="#f8fafc" />
          {isMobileMenuOpen ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close navigation"
              onPress={closeMenus}
              className="rounded-xl border border-white/40 bg-white/10 px-3 py-2"
            >
              <FontAwesomeIcon icon={faXmark} size={18} color="#f8fafc" />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open navigation"
              onPress={() => setMobileMenuOpen(true)}
              className="rounded-xl border border-white/30 bg-white/10 px-3 py-2"
            >
              <FontAwesomeIcon icon={faBars} size={18} color="#f8fafc" />
            </Pressable>
          )}
        </View>
        <ScrollView className="flex-1">
          <View className="flex-1 gap-6 px-4 py-6 md:px-8">{children}</View>
        </ScrollView>
      </View>
      {isMobileMenuOpen && (
        <View className="absolute inset-x-0 bottom-0 top-16 z-40 flex flex-col lg:hidden">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close navigation"
            onPress={closeMenus}
            className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 opacity-95"
          />
          <View className="relative z-10 flex h-full flex-col text-white">
            <ScrollView className="flex-1 pt-4">
              <View className="min-h-full pb-12">
                <Sidebar
                  sidebarContainerRef={sidebarContainerRef}
                  StarfieldComponent={StarfieldComponent}
                  prefersReducedMotion={prefersReducedMotion}
                  navInteractionLevel={navInteractionLevel}
                  depthCurve={depthCurve}
                  navItems={navItems}
                  activeItem={activeItem}
                  handleNavPress={handleNavPress}
                  renderAccountMenu={renderAccountMenu}
                  microEventFrequency={STARFIELD_MICRO_EVENT_FREQ}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      )}
      {ProfilePopupHostElement}
      <InviteModal visible={openInvite} onClose={() => setOpenInvite(false)} onSubmit={handleInviteSubmit} />
    </View>
  );
};

type SidebarProps = {
  sidebarContainerRef: React.RefObject<HTMLDivElement | null>;
  StarfieldComponent?: typeof import('./components/Starfield')['Starfield'];
  prefersReducedMotion: boolean;
  navInteractionLevel: number;
  depthCurve: (depth: number) => number;
  navItems: AppNavItem[];
  activeItem: string;
  handleNavPress: (key: string) => void;
  renderAccountMenu: () => React.ReactNode;
  microEventFrequency: number;
};

function Sidebar({
  sidebarContainerRef,
  StarfieldComponent,
  prefersReducedMotion,
  navInteractionLevel,
  depthCurve,
  navItems,
  activeItem,
  handleNavPress,
  renderAccountMenu,
  microEventFrequency,
}: SidebarProps) {
  return (
    <View className="flex h-full flex-col">
      <div
        ref={(node) => {
          sidebarContainerRef.current = node;
        }}
        className="relative flex h-full flex-col overflow-hidden"
      >
        {StarfieldComponent ? (
          <StarfieldComponent
            containerRef={sidebarContainerRef}
            variant={DEFAULT_STARFIELD_VARIANT}
            depthCurve={depthCurve}
            hoverGain={prefersReducedMotion ? 1 : 1.08}
            density={prefersReducedMotion ? 80 : 140}
            interactionLevel={navInteractionLevel}
            microEventFrequency={microEventFrequency}
            className="pointer-events-none opacity-80"
          />
        ) : null}
        <View className="relative flex h-full flex-col px-3 py-8 text-white">
          <View className="flex flex-row items-center gap-3">
            <Logo size={34} color="#f8fafc" />
          </View>
          <View className="mt-8 flex flex-1 flex-col gap-2">
            {navItems.map((item) => {
              const isActive = item.key === activeItem;
              return (
                <Pressable
                  key={item.key}
                  testID={`nav-${item.key}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  aria-current={isActive ? 'page' : undefined}
                  onPress={() => handleNavPress(item.key)}
                  className={cn(
                    'flex flex-row items-start gap-3 rounded-2xl px-4 py-3 transition-colors',
                    isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5'
                  )}
                >
                  <View className="pt-1">
                    <FontAwesomeIcon icon={item.icon} size={16} color={isActive ? '#ffffff' : '#b8c2d8'} />
                  </View>
                  <View className="flex-1">
                    <Text className={cn('text-sm font-semibold', isActive ? 'text-white' : 'text-slate-100')}>
                      {item.label}
                    </Text>
                    <Text className="text-[11px] text-slate-400">{item.description}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        <View className="mt-auto border-t border-white/10 pt-6">
          {renderAccountMenu()}
        </View>
        </View>
      </div>
    </View>
  );
}

export default AppShell;
