import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useApiClient } from '../api/client';
import { fallbackAssets, fallbackCompanies, fallbackMembers, fallbackSubscription, fallbackUsage } from './mocks';
import { shouldUseMockData } from './mockDataPolicy';
import type { AssetObject, Company, Member, SubscriptionSummary, UsagePoint } from './types';

type AccountsResponse = {
  accounts: Company[];
  currentAccountId: string | null;
};

type MembersResponse = {
  members: Member[];
};

type UsageResponse = {
  points: UsagePoint[];
};

type SubscriptionResponse = {
  subscription: SubscriptionSummary;
};

const allowMockData = shouldUseMockData();

export const useCompaniesQuery = () => {
  const api = useApiClient();
  return useQuery<{ accounts: Company[]; currentAccountId: string | null }>({
    queryKey: ['companies'],
    queryFn: async () => {
      try {
        return await api.get<AccountsResponse>('/api/accounts');
      } catch (error) {
        console.warn('Failed to load companies', error);
        if (!allowMockData) {
          throw error instanceof Error ? error : new Error('Failed to load companies');
        }
        return { accounts: fallbackCompanies, currentAccountId: fallbackCompanies[0]?.id ?? null };
      }
    },
    placeholderData: allowMockData
      ? () => ({ accounts: fallbackCompanies, currentAccountId: fallbackCompanies[0]?.id ?? null })
      : undefined,
    staleTime: 30_000,
    gcTime: 5 * 60_000
  });
};

export const useMembersQuery = (companyId?: string, companySlug?: string) => {
  const api = useApiClient();
  return useQuery<Member[]>({
    queryKey: ['company-members', companyId],
    enabled: Boolean(companyId && companySlug),
    queryFn: async () => {
      if (!companySlug) {
        return [];
      }
      try {
        const result = await api.get<MembersResponse>(`/api/accounts/${companySlug}/members`);
        return result.members;
      } catch (error) {
        console.warn('Failed to load members', error);
        if (!allowMockData) {
          throw error instanceof Error ? error : new Error('Failed to load members');
        }
        return fallbackMembers(companyId!);
      }
    },
    placeholderData: allowMockData ? () => (companyId ? fallbackMembers(companyId) : []) : undefined
  });
};

export const useAssetsQuery = (companyId?: string, companySlug?: string) => {
  const api = useApiClient();
  return useQuery<AssetObject[]>({
    queryKey: ['assets', companyId],
    enabled: Boolean(companyId && companySlug),
    queryFn: async () => {
      if (!companySlug) {
        return [];
      }
      try {
        const response = await api.get<{ assets: AssetObject[] }>(`/api/accounts/${companySlug}/assets`);
        return response.assets ?? [];
      } catch (error) {
        console.warn('Failed to load assets', error);
        if (!allowMockData) {
          throw error instanceof Error ? error : new Error('Failed to load assets');
        }
        return fallbackAssets;
      }
    },
    placeholderData: allowMockData ? fallbackAssets : undefined
  });
};

export const useUsageQuery = (companyId?: string, companySlug?: string) => {
  const api = useApiClient();
  return useQuery<UsagePoint[]>({
    queryKey: ['usage', companyId],
    enabled: Boolean(companyId && companySlug),
    queryFn: async () => {
      if (!companySlug) {
        return [];
      }
      try {
        const response = await api.get<UsageResponse>(`/api/accounts/${companySlug}/usage?days=7`);
        return response.points;
      } catch (error) {
        console.warn('Failed to load usage', error);
        if (!allowMockData) {
          throw error instanceof Error ? error : new Error('Failed to load usage');
        }
        return fallbackUsage;
      }
    },
    placeholderData: allowMockData ? fallbackUsage : undefined
  });
};

export const useSubscriptionQuery = (companyId?: string, companySlug?: string) => {
  const api = useApiClient();
  return useQuery<SubscriptionSummary>({
    queryKey: ['subscription', companyId],
    enabled: Boolean(companyId && companySlug),
    queryFn: async () => {
      if (!companySlug) {
        return fallbackSubscription;
      }
      try {
        const response = await api.get<SubscriptionResponse>(`/api/accounts/${companySlug}/subscription`);
        return response.subscription;
      } catch (error) {
        console.warn('Failed to load subscription summary', error);
        if (!allowMockData) {
          throw error instanceof Error ? error : new Error('Failed to load subscription');
        }
        return fallbackSubscription;
      }
    },
    placeholderData: allowMockData ? fallbackSubscription : undefined
  });
};

export const useCompanyById = (companies?: Company[], companyId?: string) => {
  return useMemo(() => companies?.find((company) => company.id === companyId), [companies, companyId]);
};
