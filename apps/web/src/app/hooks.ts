import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApiClient } from '../api/client';
import { fallbackAssets, fallbackCompanies, fallbackMembers, fallbackSubscription, fallbackUsage } from './mocks';
import { shouldUseMockData } from './mockDataPolicy';
import type { AssetObject, Company, Invoice, InviteDraft, Invite, Member, Product, SubscriptionSummary, UsagePoint } from './types';

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

// Invites hooks
type InvitesResponse = {
  invites: Invite[];
};

export const useInvitesQuery = (companyId?: string, companySlug?: string) => {
  const api = useApiClient();
  return useQuery<Invite[]>({
    queryKey: ['invites', companyId],
    enabled: Boolean(companyId && companySlug),
    queryFn: async () => {
      if (!companySlug) {
        return [];
      }
      try {
        const response = await api.get<InvitesResponse>(`/api/accounts/${companySlug}/invites`);
        return response.invites ?? [];
      } catch (error) {
        console.warn('Failed to load invites', error);
        if (!allowMockData) {
          throw error instanceof Error ? error : new Error('Failed to load invites');
        }
        return [];
      }
    },
    placeholderData: allowMockData ? [] : undefined
  });
};

export const useSendInviteMutation = (companyId?: string, companySlug?: string) => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invite: InviteDraft) => {
      if (!companySlug) {
        throw new Error('Company slug is required');
      }
      return await api.post<{ invite: Invite }>(`/api/accounts/${companySlug}/invites`, invite);
    },
    onMutate: async (newInvite) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['invites', companyId] });

      // Snapshot previous value
      const previousInvites = queryClient.getQueryData(['invites', companyId]);

      // Optimistically update
      queryClient.setQueryData(['invites', companyId], (old: Invite[] = []) => [
        ...old,
        {
          id: `temp-${Date.now()}`,
          email: newInvite.email,
          role: newInvite.role,
          status: 'pending' as const,
          invitedAt: new Date().toISOString()
        }
      ]);

      return { previousInvites };
    },
    onError: (err, newInvite, context) => {
      // Rollback on error
      if (context?.previousInvites) {
        queryClient.setQueryData(['invites', companyId], context.previousInvites);
      }
    },
    onSettled: () => {
      // Refetch after mutation
      queryClient.invalidateQueries({ queryKey: ['invites', companyId] });
    }
  });
};

export const useDeleteInviteMutation = (companyId?: string, companySlug?: string) => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inviteId: string) => {
      if (!companySlug) {
        throw new Error('Company slug is required');
      }
      return await api.delete(`/api/accounts/${companySlug}/invites/${inviteId}`);
    },
    onMutate: async (inviteId) => {
      await queryClient.cancelQueries({ queryKey: ['invites', companyId] });
      const previousInvites = queryClient.getQueryData(['invites', companyId]);

      queryClient.setQueryData(['invites', companyId], (old: Invite[] = []) =>
        old.filter((invite) => invite.id !== inviteId)
      );

      return { previousInvites };
    },
    onError: (err, inviteId, context) => {
      if (context?.previousInvites) {
        queryClient.setQueryData(['invites', companyId], context.previousInvites);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['invites', companyId] });
    }
  });
};

export const useResendInviteMutation = (companyId?: string, companySlug?: string) => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inviteId: string) => {
      if (!companySlug) {
        throw new Error('Company slug is required');
      }
      return await api.post(`/api/accounts/${companySlug}/invites/${inviteId}/resend`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites', companyId] });
    }
  });
};

export const useUpdateMemberRoleMutation = (companyId?: string, companySlug?: string) => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: Member['role'] }) => {
      if (!companySlug) {
        throw new Error('Company slug is required');
      }
      return await api.patch(`/api/accounts/${companySlug}/members/${memberId}`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-members', companyId] });
    }
  });
};

export const useRemoveMemberMutation = (companyId?: string, companySlug?: string) => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (memberId: string) => {
      if (!companySlug) {
        throw new Error('Company slug is required');
      }
      return await api.delete(`/api/accounts/${companySlug}/members/${memberId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-members', companyId] });
    }
  });
};

// Billing hooks
type ProductsResponse = {
  products: Product[];
};

type InvoicesResponse = {
  invoices: Invoice[];
};

type CheckoutResponse = {
  url: string;
};

type PortalResponse = {
  url: string;
};

export const useProductsQuery = (companySlug?: string) => {
  const api = useApiClient();
  return useQuery<Product[]>({
    queryKey: ['products', companySlug],
    enabled: Boolean(companySlug),
    queryFn: async () => {
      if (!companySlug) {
        return [];
      }
      try {
        const response = await api.get<ProductsResponse>(`/api/accounts/${companySlug}/billing/products`);
        return response.products ?? [];
      } catch (error) {
        console.warn('Failed to load products', error);
        if (!allowMockData) {
          throw error instanceof Error ? error : new Error('Failed to load products');
        }
        return [];
      }
    },
    placeholderData: allowMockData ? [] : undefined,
    staleTime: 5 * 60_000
  });
};

export const useInvoicesQuery = (companyId?: string, companySlug?: string) => {
  const api = useApiClient();
  return useQuery<Invoice[]>({
    queryKey: ['invoices', companyId],
    enabled: Boolean(companyId && companySlug),
    queryFn: async () => {
      if (!companySlug) {
        return [];
      }
      try {
        const response = await api.get<InvoicesResponse>(`/api/accounts/${companySlug}/billing/invoices`);
        return response.invoices ?? [];
      } catch (error) {
        console.warn('Failed to load invoices', error);
        if (!allowMockData) {
          throw error instanceof Error ? error : new Error('Failed to load invoices');
        }
        return [];
      }
    },
    placeholderData: allowMockData ? [] : undefined
  });
};

export const useCreateCheckoutMutation = (companyId?: string, companySlug?: string) => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (priceId: string) => {
      if (!companySlug) {
        throw new Error('Company slug is required');
      }
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://app.localhost';
      return await api.post<CheckoutResponse>(`/api/accounts/${companySlug}/billing/checkout`, {
        priceId,
        successUrl: `${baseUrl}/app/billing?checkout=success`,
        cancelUrl: `${baseUrl}/app/billing?checkout=cancelled`
      });
    },
    onSuccess: () => {
      // Invalidate subscription and invoices after checkout
      queryClient.invalidateQueries({ queryKey: ['subscription', companyId] });
      queryClient.invalidateQueries({ queryKey: ['invoices', companyId] });
    }
  });
};

export const useCreatePortalMutation = (companyId?: string, companySlug?: string) => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!companySlug) {
        throw new Error('Company slug is required');
      }
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://app.localhost';
      return await api.post<PortalResponse>(`/api/accounts/${companySlug}/billing/portal`, {
        returnUrl: `${baseUrl}/app/billing`
      });
    },
    onSuccess: () => {
      // Invalidate subscription and invoices after portal interaction
      queryClient.invalidateQueries({ queryKey: ['subscription', companyId] });
      queryClient.invalidateQueries({ queryKey: ['invoices', companyId] });
    }
  });
};
