import React, { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useCompanyStore } from '../state/companyStore';
import type { Company, InviteDraft } from './types';
import { useApiClient } from '../api/client';
import InviteModal from './components/InviteModal';
import { Button } from '../components/ui';
import { Logo } from '../components/Logo';
import { cn } from '../lib/cn';

export type AppNavItem = {
  key: string;
  label: string;
  description: string;
  icon?: string;
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
      return;
    }
    try {
      await api.post(`/api/accounts/${activeCompany.slug}/invites`, draft);
    } catch (error) {
      console.warn('Failed to create invite', error);
    }
  };

  return (
    <View className="min-h-screen flex-row bg-surface">
      <View className="hidden w-72 flex-col gap-8 border-r border-slate-200 bg-white p-6 lg:flex">
        <View className="flex-row items-center gap-3">
          <Logo size={30} />
          <View>
            <Text className="text-lg font-bold text-ink">justevery</Text>
            <Text className="text-xs uppercase tracking-[0.2em] text-slate-400">app shell</Text>
          </View>
        </View>
        <View className="flex flex-col gap-3">
          {navItems.map((item) => {
            const isActive = item.key === activeItem;
            return (
              <Pressable
                key={item.key}
                onPress={() => onNavigate(item.key)}
                className={cn(
                  'rounded-2xl p-4',
                  isActive ? 'bg-brand-50 border border-brand-100' : 'border border-transparent'
                )}
              >
                <Text className="text-base font-semibold text-ink">
                  {item.icon ? `${item.icon} ` : ''}
                  {item.label}
                </Text>
                <Text className="text-xs text-slate-500">{item.description}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="flex-1 flex-col">
        <View className="border-b border-slate-200 bg-white">
          <View className="flex-row items-center justify-between px-6 py-4">
            <View className="space-y-1">
              <Text className="text-2xl font-bold text-ink">
                {navItems.find((item) => item.key === activeItem)?.label ?? 'Overview'}
              </Text>
              <Text className="text-sm text-slate-500">
                {navItems.find((item) => item.key === activeItem)?.description}
              </Text>
            </View>

            <View className="flex-row items-center gap-3">
              <View className="relative">
                <Pressable
                  onPress={() => setShowSwitcher((prev) => !prev)}
                  className="min-w-[180px] rounded-2xl border border-slate-200 px-4 py-2"
                >
                  <Text className="font-semibold text-ink">
                    {isLoadingCompanies ? 'Loading companies…' : activeCompany?.name ?? 'No companies'}
                  </Text>
                  <Text className="text-xs text-slate-500">{activeCompany?.plan ?? 'Plan TBD'}</Text>
                </Pressable>
                {showSwitcher ? (
                  <View className="absolute left-0 right-0 top-full z-20 mt-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-card">
                    {companies.map((company) => (
                      <Pressable
                        key={company.id}
                        onPress={() => handleCompanyChange(company)}
                        className={cn(
                          'rounded-xl px-3 py-2',
                          company.id === activeCompany?.id && 'bg-brand-50'
                        )}
                      >
                        <Text className="font-semibold text-ink">{company.name}</Text>
                        <Text className="text-xs text-slate-500">{company.plan}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>

              <Button size="sm" onPress={() => setOpenInvite(true)}>
                Invite teammates
              </Button>

              <View className="h-10 w-10 items-center justify-center rounded-full bg-ink">
                <Text className="font-semibold text-white">JP</Text>
              </View>
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
