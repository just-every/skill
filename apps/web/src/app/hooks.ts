import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useApiClient } from '../api/client';
import { fallbackAssets, fallbackCompanies, fallbackMembers, fallbackSubscription, fallbackUsage } from './mocks';
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

export const useCompaniesQuery = () => {
  const api = useApiClient();
  return useQuery<{ accounts: Company[]; currentAccountId: string | null }>({
    queryKey: ['companies'],
    queryFn: async () => {
      try {
        return await api.get<AccountsResponse>('/api/accounts');
      } catch (error) {
        console.warn('Falling back to static companies', error);
        return { accounts: fallbackCompanies, currentAccountId: fallbackCompanies[0]?.id ?? null };
      }
    },
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
        console.warn('Falling back to static members', error);
        return fallbackMembers(companyId!);
      }
    },
    placeholderData: () => (companyId ? fallbackMembers(companyId) : [])
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
        console.warn('Falling back to static assets', error);
        return fallbackAssets;
      }
    },
    placeholderData: fallbackAssets
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
        console.warn('Falling back to static usage series', error);
        return fallbackUsage;
      }
    },
    placeholderData: fallbackUsage
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
        console.warn('Falling back to static subscription summary', error);
        return fallbackSubscription;
      }
    },
    placeholderData: fallbackSubscription
  });
};

export const useCompanyById = (companies?: Company[], companyId?: string) => {
  return useMemo(() => companies?.find((company) => company.id === companyId), [companies, companyId]);
};
