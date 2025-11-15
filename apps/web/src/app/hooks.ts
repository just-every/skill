import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApiClient } from '../api/client';
import { fallbackCompanies, fallbackSubscription } from './mocks';
import { shouldUseMockData } from './mockDataPolicy';
import type { Company, Invoice, Product, SubscriptionSummary } from './types';
import { usePublicEnv } from '../runtimeEnv';

type AccountsResponse = {
  accounts: Company[];
  currentAccountId: string | null;
};

type SubscriptionResponse = {
  subscription: SubscriptionSummary;
};

type ProductsResponse = {
  products: Product[];
};

type InvoicesResponse = {
  invoices: Invoice[];
};

const allowMockData = shouldUseMockData();
const DEFAULT_CHECKOUT_BASE = 'https://app.localhost';

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const ensureAbsoluteUrl = (value: string): string => {
  try {
    return new URL(value).toString();
  } catch {
    throw new Error('Stripe checkout redirects require an absolute base URL');
  }
};

const resolveCheckoutBaseUrl = (workerOrigin?: string, workerOriginLocal?: string): string => {
  if (workerOrigin && workerOrigin.trim().length > 0) {
    return ensureAbsoluteUrl(workerOrigin.trim());
  }
  if (workerOriginLocal && workerOriginLocal.trim().length > 0) {
    return ensureAbsoluteUrl(workerOriginLocal.trim());
  }
  if (typeof window !== 'undefined') {
    return ensureAbsoluteUrl(window.location.origin);
  }
  return ensureAbsoluteUrl(DEFAULT_CHECKOUT_BASE);
};

export const buildCheckoutRedirectUrls = (baseUrl: string) => {
  const normalised = trimTrailingSlash(ensureAbsoluteUrl(baseUrl));
  return {
    successUrl: `${normalised}/app/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${normalised}/app/billing/cancel`,
  };
};

export const useCompaniesQuery = () => {
  const api = useApiClient();
  return useQuery({
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
    gcTime: 5 * 60_000,
  });
};

export const useCompanyById = (companies?: Company[], companyId?: string) => {
  return useMemo(() => companies?.find((company) => company.id === companyId), [companies, companyId]);
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
    placeholderData: allowMockData ? fallbackSubscription : undefined,
  });
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
    staleTime: 5 * 60_000,
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
    placeholderData: allowMockData ? [] : undefined,
  });
};

export const useCreateCheckoutMutation = (companyId?: string, companySlug?: string) => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const env = usePublicEnv();

  return useMutation({
    mutationFn: async (priceId: string) => {
      if (!companySlug) {
        throw new Error('Company slug is required');
      }
      const baseUrl = resolveCheckoutBaseUrl(env.workerOrigin, env.workerOriginLocal);
      const { successUrl, cancelUrl } = buildCheckoutRedirectUrls(baseUrl);
      return await api.post<{ url: string }>(`/api/accounts/${companySlug}/billing/checkout`, {
        priceId,
        successUrl,
        cancelUrl,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription', companyId] });
      queryClient.invalidateQueries({ queryKey: ['invoices', companyId] });
    },
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
      return await api.post<{ url: string }>(`/api/accounts/${companySlug}/billing/portal`, {
        returnUrl: `${baseUrl}/app/billing`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription', companyId] });
      queryClient.invalidateQueries({ queryKey: ['invoices', companyId] });
    },
  });
};

export const useUpdateBillingEmailMutation = (companyId?: string, companySlug?: string) => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (billingEmail: string | null) => {
      if (!companySlug) {
        throw new Error('Company slug is required');
      }
      return await api.patch(`/api/accounts/${companySlug}`, { billingEmail });
    },
    onMutate: async (billingEmail) => {
      if (!companyId) {
        return;
      }
      await queryClient.cancelQueries({ queryKey: ['companies'] });
      const previous = queryClient.getQueryData<{ accounts: Company[]; currentAccountId: string | null }>(['companies']);
      if (previous) {
        queryClient.setQueryData(['companies'], {
          accounts: previous.accounts.map((company) =>
            company.id === companyId ? { ...company, billingEmail: billingEmail ?? undefined } : company,
          ),
          currentAccountId: previous.currentAccountId,
        });
      }
      return { previous };
    },
    onError: (_err, _billingEmail, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['companies'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });
};

