import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faAngleDown, faArrowRightFromBracket, faEnvelope } from '@fortawesome/pro-solid-svg-icons';

import { useCompanyStore } from '../state/companyStore';
import type { Company, InviteDraft } from './types';
import { useApiClient } from '../api/client';
import { useSwitchCompanyMutation } from './hooks';
import InviteModal from './components/InviteModal';
import { Button } from '../components/ui';
import { Logo } from '../components/Logo';
import { cn } from '../lib/cn';
import { useAuth } from '../auth/AuthProvider';

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

const AppShell = ({ navItems, activeItem, onNavigate, companies, isLoadingCompanies, children }: AppShellProps) => {
  const { activeCompanyId, setActiveCompany } = useCompanyStore();
  const api = useApiClient();
  const [openInvite, setOpenInvite] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [switcherHover, setSwitcherHover] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [pendingCompanyId, setPendingCompanyId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const switcherRef = React.useRef<HTMLDivElement | null>(null);
  const accountMenuRef = React.useRef<HTMLDivElement | null>(null);
  const { session, signOut } = useAuth();
  const switchCompanyMutation = useSwitchCompanyMutation();

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
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }
    const handleGlobalPress = (event: MouseEvent | TouchEvent) => {
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

  return (
    <View className="flex min-h-screen flex-row bg-surface">
      <View className="hidden w-72 border-r border-slate-900/30 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-6 py-8 text-white lg:flex">
        <View className="flex h-full flex-col">
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
                  onPress={() => onNavigate(item.key)}
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
            <View className="space-y-2">
              <Text className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Current company</Text>
              <View
                className="relative"
                ref={switcherRef}
                onHoverIn={() => setSwitcherHover(true)}
                onHoverOut={() => setSwitcherHover(false)}
              >
                <Pressable
                  testID="company-switcher-toggle"
                  onPress={() => {
                    setShowSwitcher((prev) => !prev);
                    setSwitcherHover(false);
                  }}
                  className="rounded-2xl border border-slate-700 bg-slate-950/70 px-3 py-3 text-left text-sm font-semibold text-white"
                  accessibilityRole="button"
                  accessibilityLabel="Select company"
                  accessibilityExpanded={showSwitcher || switcherHover}
                  accessibilityHasPopup="menu"
                >
                  <Text>{activeCompany?.name ?? 'Select company'}</Text>
                  <Text className="text-xs text-slate-400">{activeCompany?.plan ?? '—'}</Text>
                </Pressable>
                {(showSwitcher || switcherHover) && (
                  <View
                    accessibilityRole="menu"
                    aria-label="Company switcher"
                    testID="company-switcher-menu"
                    className="absolute right-0 bottom-full mb-2 w-48 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/90 p-1 shadow-sm"
                  >
                    {companies.map((company) => (
                      <Pressable
                        key={company.id}
                        onPress={() => void handleCompanyChange(company)}
                        className={cn(
                          'rounded-xl px-3 py-2 transition-colors',
                          company.id === activeCompany?.id
                            ? 'bg-white/10 text-white'
                            : 'text-slate-200 hover:bg-white/5',
                          switchCompanyMutation.isPending ? 'opacity-60' : undefined
                        )}
                        accessibilityRole="menuitemradio"
                        accessibilityState={{
                          selected: company.id === activeCompany?.id,
                          busy: pendingCompanyId === company.id && switchCompanyMutation.isPending,
                        }}
                        disabled={switchCompanyMutation.isPending}
                      >
                        <Text className="text-sm font-semibold">
                          {pendingCompanyId === company.id && switchCompanyMutation.isPending ? 'Switching…' : company.name}
                        </Text>
                        <Text className="text-[11px] text-slate-400">
                          {pendingCompanyId === company.id && switchCompanyMutation.isPending ? 'Hold tight…' : company.plan}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
              {switchError ? (
                <Text className="text-[11px] text-rose-300">{switchError}</Text>
              ) : null}
            </View>
            <View className="mt-4 space-y-2">
              <Text className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Account</Text>
              <View className="relative" ref={accountMenuRef}>
                <Pressable
                  testID="account-menu-toggle"
                  onPress={() => setAccountMenuOpen((prev) => !prev)}
                  accessibilityRole="button"
                  accessibilityLabel="Account options"
                  accessibilityExpanded={accountMenuOpen}
                  accessibilityHasPopup="menu"
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
                    className="absolute right-0 bottom-full mb-2 min-w-[220px] rounded-2xl border border-slate-800 bg-slate-950/90 p-4 shadow-sm"
                  >
                    <Text className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Signed in as</Text>
                    <View className="mt-1 flex-row items-center gap-2">
                      <FontAwesomeIcon icon={faEnvelope} size={11} color="#94a3b8" />
                      <Text className="text-sm font-semibold text-white" numberOfLines={1} ellipsizeMode="tail">
                        {userEmail}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => void handleSignOut()}
                      accessibilityRole="menuitem"
                      className="mt-4 flex flex-row items-center justify-center gap-2 rounded-2xl border border-slate-700 px-4 py-2"
                      disabled={isSigningOut}
                    >
                      <FontAwesomeIcon icon={faArrowRightFromBracket} size={14} color="#94a3b8" />
                      <Text className="text-sm font-semibold text-white">
                        {isSigningOut ? 'Signing out…' : 'Logout'}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>
      </View>
      <View className="flex min-h-screen flex-1 flex-col bg-surface">
        <View className="flex flex-row items-center justify-end border-b border-slate-200 bg-white/90 px-6 py-4 backdrop-blur z-40">
          <Button size="sm" variant="primary" onPress={() => setOpenInvite(true)}>
            Invite teammates
          </Button>
        </View>
        <ScrollView className="flex-1">
          <View className="flex-1 gap-6 px-4 py-6 md:px-8">{children}</View>
        </ScrollView>
      </View>
      <InviteModal visible={openInvite} onClose={() => setOpenInvite(false)} onSubmit={handleInviteSubmit} />
    </View>
  );
};

export default AppShell;
