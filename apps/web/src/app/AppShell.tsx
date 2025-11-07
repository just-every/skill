import React, { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useCompanyStore } from '../state/companyStore';
import type { Company, InviteDraft } from './types';
import { useApiClient } from '../api/client';
import InviteModal from './components/InviteModal';

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
    <View style={{ flex: 1, flexDirection: 'row', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <View
        style={{
          width: 240,
          backgroundColor: '#ffffff',
          borderRightWidth: 1,
          borderRightColor: '#e2e8f0',
          padding: 24,
          gap: 24
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: '700', color: '#0f172a' }}>justevery</Text>
        <View style={{ gap: 12 }}>
          {navItems.map((item) => {
            const isActive = item.key === activeItem;
            return (
              <Pressable
                key={item.key}
                onPress={() => onNavigate(item.key)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 14,
                  backgroundColor: isActive ? 'rgba(56,189,248,0.15)' : 'transparent'
                }}
              >
                <Text style={{ color: '#0f172a', fontWeight: '600', fontSize: 15 }}>
                  {item.icon ? `${item.icon} ` : ''}
                  {item.label}
                </Text>
                <Text style={{ color: '#94a3b8', fontSize: 12 }}>{item.description}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ flex: 1, flexDirection: 'column' }}>
        <View
          style={{
            borderBottomWidth: 1,
            borderBottomColor: '#e2e8f0',
            backgroundColor: '#ffffff'
          }}
        >
          <View
            style={{
              paddingHorizontal: 32,
              paddingVertical: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <View style={{ gap: 6 }}>
              <Text style={{ color: '#0f172a', fontSize: 24, fontWeight: '700' }}>
                {navItems.find((item) => item.key === activeItem)?.label ?? 'Overview'}
              </Text>
              <Text style={{ color: '#94a3b8' }}>
                {navItems.find((item) => item.key === activeItem)?.description}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
              <View style={{ position: 'relative' }}>
                <Pressable
                  onPress={() => setShowSwitcher((prev) => !prev)}
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5f5',
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 14,
                    minWidth: 180
                  }}
                >
                  <Text style={{ color: '#0f172a', fontWeight: '600' }}>
                    {isLoadingCompanies ? 'Loading companies…' : activeCompany?.name ?? 'No companies'}
                  </Text>
                  <Text style={{ color: '#94a3b8', fontSize: 12 }}>{activeCompany?.plan ?? 'Plan TBD'}</Text>
                </Pressable>
                {showSwitcher ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: '105%',
                      left: 0,
                      right: 0,
                      backgroundColor: '#ffffff',
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                      padding: 12,
                      gap: 8,
                      zIndex: 10,
                      shadowColor: '#0f172a',
                      shadowOpacity: 0.1,
                      shadowRadius: 12
                    }}
                  >
                    {companies.map((company) => (
                      <Pressable
                        key={company.id}
                        onPress={() => handleCompanyChange(company)}
                        style={{
                          padding: 8,
                          borderRadius: 12,
                          backgroundColor:
                            company.id === activeCompany?.id ? 'rgba(56,189,248,0.15)' : 'transparent'
                        }}
                      >
                        <Text style={{ color: '#0f172a', fontWeight: '600' }}>{company.name}</Text>
                        <Text style={{ color: '#94a3b8', fontSize: 12 }}>{company.plan}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>

              <Pressable
                onPress={() => setOpenInvite(true)}
                style={{
                  backgroundColor: '#38bdf8',
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  borderRadius: 14
                }}
              >
                <Text style={{ color: '#0f172a', fontWeight: '700' }}>Invite teammates</Text>
              </Pressable>

              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: '#0f172a',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Text style={{ color: '#f8fafc', fontWeight: '700' }}>JP</Text>
              </View>
            </View>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 32, gap: 24, flexGrow: 1 }}>{children}</ScrollView>
      </View>

      <InviteModal visible={openInvite} onClose={() => setOpenInvite(false)} onSubmit={handleInviteSubmit} />
    </View>
  );
};

export default AppShell;
