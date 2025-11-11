import React, { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faAngleDown, faArrowRightFromBracket, faEnvelope } from '@fortawesome/pro-solid-svg-icons';

import { useCompanyStore } from '../state/companyStore';
import type { Company, InviteDraft } from './types';
import { useApiClient } from '../api/client';
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const { session, signOut } = useAuth();

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

  const handleCompanyChange = (company: Company) => {
    setShowSwitcher(false);
    setActiveCompany(company.id);
  };

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

  const handleSignOut = async () => {
    await signOut({ returnUrl: typeof window !== 'undefined' ? window.location.origin : undefined });
    if (typeof window !== 'undefined') {
      window.location.assign('/');
    }
  };

  return (
    <View className="flex min-h-screen flex-row bg-surface">
      <View className="hidden w-72 flex-col gap-8 border-r border-slate-900/30 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-6 py-8 text-white lg:flex">
        <View className="flex flex-row items-center gap-3">
          <Logo size={34} color="#f8fafc" />
          <View>
            <Text className="text-lg font-semibold text-white">justevery</Text>
            <Text className="text-[11px] uppercase tracking-[0.3em] text-slate-400">console</Text>
          </View>
        </View>
        <View className="space-y-2">
          {navItems.map((item) => {
            const isActive = item.key === activeItem;
            return (
              <Pressable
                key={item.key}
                onPress={() => onNavigate(item.key)}
                className={cn(
                  'flex flex-row items-center gap-3 rounded-2xl px-4 py-3 transition-colors',
                  isActive
                    ? 'bg-white/10 text-white shadow-lg shadow-black/20'
                    : 'text-slate-300 hover:bg-white/5'
                )}
              >
                <FontAwesomeIcon icon={item.icon} size={16} color={isActive ? '#ffffff' : '#94a3b8'} />
                <View>
                  <Text className="text-sm font-semibold">{item.label}</Text>
                  <Text className="text-xs text-slate-400">{item.description}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="flex min-h-screen flex-1 flex-col bg-surface">
        <View className="flex flex-row items-center justify-between border-b border-slate-200 bg-white/90 px-6 py-4 backdrop-blur">
          <View className="relative">
            <Pressable
              onPress={() => setShowSwitcher((prev) => !prev)}
              className="min-w-[220px] rounded-2xl border border-slate-200 px-4 py-2 text-left"
            >
              <Text className="text-sm font-semibold text-ink">
                {isLoadingCompanies ? 'Loading companies…' : activeCompany?.name ?? 'No companies'}
              </Text>
              <Text className="text-xs text-slate-500">{activeCompany?.plan ?? 'Plan TBD'}</Text>
            </Pressable>
            {showSwitcher ? (
              <View className="absolute left-0 right-0 top-full z-30 mt-2 max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
                {companies.map((company) => (
                  <Pressable
                    key={company.id}
                    onPress={() => handleCompanyChange(company)}
                    className={cn(
                      'rounded-xl px-3 py-2',
                      company.id === activeCompany?.id ? 'bg-brand-50 text-ink' : 'text-slate-700'
                    )}
                  >
                    <Text className="text-sm font-semibold">{company.name}</Text>
                    <Text className="text-xs text-slate-500">{company.plan}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <View className="flex flex-row items-center gap-3">
            <Button size="sm" variant="primary" onPress={() => setOpenInvite(true)}>
              Invite teammates
            </Button>

            <View className="relative">
              <Pressable
                onPress={() => setAccountMenuOpen((prev) => !prev)}
                className="flex flex-row items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1"
              >
                <View className="h-9 w-9 items-center justify-center rounded-full bg-ink">
                  <Text className="text-sm font-semibold text-white">{initials}</Text>
                </View>
                <FontAwesomeIcon icon={faAngleDown} size={12} color="#0f172a" />
              </Pressable>
              {accountMenuOpen ? (
                <View className="absolute right-0 top-full z-30 mt-2 min-w-[220px] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
                  <Text className="text-xs uppercase tracking-[0.3em] text-slate-400">Signed in as</Text>
                  <Text className="mt-1 text-sm font-semibold text-ink">{displayName}</Text>
                  <View className="mt-1 flex flex-row items-center gap-2 text-slate-500">
                    <FontAwesomeIcon icon={faEnvelope} size={12} color="#64748b" />
                    <Text className="text-xs text-slate-500">{userEmail}</Text>
                  </View>
                  <Pressable
                    onPress={handleSignOut}
                    className="mt-4 flex flex-row items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2"
                  >
                    <FontAwesomeIcon icon={faArrowRightFromBracket} size={14} color="#0f172a" />
                    <Text className="text-sm font-semibold text-ink">Sign out</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>
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
