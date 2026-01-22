import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApiClient } from '../api/client';
import type { AssetObject, Company, DesignRun, DesignRunCreateInput, DesignRunDetail, Invoice, InviteDraft, Invite, Member, Product, SubscriptionSummary, UsagePoint } from './types';
import { usePublicEnv } from '../runtimeEnv';

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

type SwitchCompanyResponse = {
  ok: boolean;
  currentAccountId: string;
  currentAccountSlug: string;
};

const DEFAULT_CHECKOUT_BASE = 'https://app.localhost';

const trimTrailingSlash = (value: string): string => {
  return value.replace(/\/+$/, '');
};

const ensureAbsoluteUrl = (value: string): string => {
  try {
    // Normalise and validate the URL; throws if invalid.
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
  return useQuery<{ accounts: Company[]; currentAccountId: string | null }>({
    queryKey: ['companies'],
    queryFn: async () => await api.get<AccountsResponse>('/api/accounts'),
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
      const result = await api.get<MembersResponse>(`/api/accounts/${companySlug}/members`);
      return result.members;
    }
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
      const response = await api.get<{ assets: AssetObject[] }>(`/api/accounts/${companySlug}/assets`);
      return response.assets ?? [];
    }
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
      const response = await api.get<UsageResponse>(`/api/accounts/${companySlug}/usage?days=7`);
      return response.points;
    }
  });
};

export const useSubscriptionQuery = (companyId?: string, companySlug?: string) => {
  const api = useApiClient();
  return useQuery<SubscriptionSummary>({
    queryKey: ['subscription', companyId],
    enabled: Boolean(companyId && companySlug),
    queryFn: async () => {
      if (!companySlug) {
        throw new Error('companySlug is required');
      }
      const response = await api.get<SubscriptionResponse>(`/api/accounts/${companySlug}/subscription`);
      return response.subscription;
    },
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
      const response = await api.get<InvitesResponse>(`/api/accounts/${companySlug}/invites`);
      return response.invites ?? [];
    }
  });
};

export const useSendInviteMutation = (companyId?: string, companySlug?: string) => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invite: InviteDraft) => {
      if (!companySlug) {
        throw new Error('Organization slug is required');
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
        throw new Error('Organization slug is required');
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
        throw new Error('Organization slug is required');
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
        throw new Error('Organization slug is required');
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
        throw new Error('Organization slug is required');
      }
      return await api.delete(`/api/accounts/${companySlug}/members/${memberId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-members', companyId] });
    }
  });
};

export const useUpdateMemberNameMutation = (companyId?: string, companySlug?: string) => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ memberId, name }: { memberId: string; name: string }) => {
      if (!companySlug) {
        throw new Error('Organization slug is required');
      }
      return await api.patch(`/api/accounts/${companySlug}/members/${memberId}`, { name });
    },
    onMutate: async ({ memberId, name }) => {
      await queryClient.cancelQueries({ queryKey: ['company-members', companyId] });
      const previousMembers = queryClient.getQueryData<Member[]>(['company-members', companyId]);

      queryClient.setQueryData<Member[]>(['company-members', companyId], (old = []) =>
        old.map((member) => (member.id === memberId ? { ...member, name } : member))
      );

      return { previousMembers };
    },
    onError: (err, variables, context) => {
      if (context?.previousMembers) {
        queryClient.setQueryData(['company-members', companyId], context.previousMembers);
      }
    },
    onSettled: () => {
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
      const response = await api.get<ProductsResponse>(`/api/accounts/${companySlug}/billing/products`);
      return response.products ?? [];
    },
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
      const response = await api.get<InvoicesResponse>(`/api/accounts/${companySlug}/billing/invoices`);
      return response.invoices ?? [];
    }
  });
};

export const useCreateCheckoutMutation = (companyId?: string, companySlug?: string) => {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const env = usePublicEnv();

  return useMutation({
    mutationFn: async (priceId: string) => {
      if (!companySlug) {
        throw new Error('Organization slug is required');
      }
      const baseUrl = resolveCheckoutBaseUrl(env.workerOrigin, env.workerOriginLocal);
      const { successUrl, cancelUrl } = buildCheckoutRedirectUrls(baseUrl);
      return await api.post<CheckoutResponse>(`/api/accounts/${companySlug}/billing/checkout`, {
        priceId,
        successUrl,
        cancelUrl
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
        throw new Error('Organization slug is required');
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

export const useSwitchCompanyMutation = () => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ slug }: { slug: string }) => {
      if (!slug) {
        throw new Error('Organization slug is required');
      }
      return await api.post<SwitchCompanyResponse>(`/api/accounts/${slug}/switch`, {});
    },
    onSuccess: (data) => {
      queryClient.setQueryData<{ accounts: Company[]; currentAccountId: string | null } | undefined>(
        ['companies'],
        (previous) => {
          if (!previous) {
            return previous;
          }
          return {
            ...previous,
            currentAccountId: data.currentAccountId ?? previous.currentAccountId,
          };
        }
      );
    }
  });
};

export const useUpdateBillingEmailMutation = (companyId?: string, companySlug?: string) => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (billingEmail: string | null) => {
      if (!companySlug) {
        throw new Error('Organization slug is required');
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
            company.id === companyId ? { ...company, billingEmail: billingEmail ?? undefined } : company
          ),
          currentAccountId: previous.currentAccountId
        });
      }
      return { previous };
    },
    onError: (err, billingEmail, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['companies'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    }
  });
};

// Design runs hooks
type DesignRunsResponse = {
  runs: Array<Record<string, unknown>>;
};

type DesignRunDetailResponse = {
  run: Record<string, unknown>;
};

type DesignRunCreateResponse = {
  run: Record<string, unknown>;
};

type DesignRunConfig = {
  name?: string;
  prompt?: string;
  variants?: number;
  style?: string;
};

const parseDesignRunConfig = (raw: unknown): DesignRunConfig | undefined => {
  if (!raw) {
    return undefined;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as DesignRunConfig;
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch {
      return undefined;
    }
  }
  if (typeof raw === 'object') {
    return raw as DesignRunConfig;
  }
  return undefined;
};

const normaliseDesignRun = (raw: Record<string, unknown>): DesignRun => {
  const config = parseDesignRunConfig(raw.config) ?? {};
  const prompt = (raw.prompt as string | undefined) ?? config.prompt ?? '';
  const createdAt = String((raw.createdAt ?? raw['created_at'] ?? new Date().toISOString()) as string);
  const startedAt = raw.startedAt ?? raw['started_at'] ?? null;
  const completedAt = raw.completedAt ?? raw['completed_at'] ?? null;
  const updatedAt = String((raw.updatedAt ?? raw['updated_at'] ?? completedAt ?? startedAt ?? createdAt) as string);
  const name = (config.name && config.name.trim()) || (prompt ? prompt.slice(0, 64) : 'Untitled Run');

  return {
    id: String(raw.id ?? ''),
    name,
    status: String(raw.status ?? 'pending') as DesignRun['status'],
    createdAt,
    updatedAt,
    startedAt: startedAt ? String(startedAt) : null,
    completedAt: completedAt ? String(completedAt) : null,
    progress: typeof raw.progress === 'number' ? raw.progress : undefined,
    error: raw.error ? String(raw.error) : null,
    config: {
      name: typeof config.name === 'string' && config.name.trim() ? config.name.trim() : undefined,
      prompt,
      variants: typeof config.variants === 'number' ? config.variants : undefined,
      style: typeof config.style === 'string' && config.style.trim() ? config.style.trim() : undefined,
    },
  };
};

const normaliseDesignRunDetail = (raw: Record<string, unknown>): DesignRunDetail => {
  const base = normaliseDesignRun(raw);
  const timeline = Array.isArray(raw.timeline)
    ? raw.timeline
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const record = entry as Record<string, unknown>;
        const timestamp = record.timestamp ? String(record.timestamp) : '';
        const event = record.event ? String(record.event) : '';
        if (!timestamp || !event) {
          return null;
        }
        return {
          timestamp,
          event,
          message: record.message ? String(record.message) : undefined,
        };
      })
      .filter(Boolean)
    : undefined;

  const outputs = Array.isArray(raw.outputs)
    ? raw.outputs
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const record = entry as Record<string, unknown>;
        const id = record.id ? String(record.id) : '';
        const url = record.url ? String(record.url) : '';
        if (!id || !url) {
          return null;
        }
        const type = record.type ? String(record.type) : 'json';
        return {
          id,
          type: (['image', 'video', 'html', 'json'].includes(type) ? type : 'json') as DesignRunDetail['outputs'][number]['type'],
          url,
          thumbnail: record.thumbnail ? String(record.thumbnail) : undefined,
          metadata: typeof record.metadata === 'object' && record.metadata ? (record.metadata as Record<string, unknown>) : undefined,
        };
      })
      .filter(Boolean)
    : undefined;

  return {
    ...base,
    timeline,
    outputs,
  };
};

export const useDesignRunsQuery = (companyId?: string, companySlug?: string) => {
  const api = useApiClient();
  return useQuery<DesignRun[]>({
    queryKey: ['design-runs', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const response = await api.get<DesignRunsResponse>(`/api/design/runs`);
      return (response.runs ?? []).map(normaliseDesignRun);
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const hasActiveRuns = data.some((run) => run.status === 'pending' || run.status === 'running');
      return hasActiveRuns ? 5000 : false;
    }
  });
};

export const useDesignRunDetailQuery = (companyId?: string, companySlug?: string, runId?: string) => {
  const api = useApiClient();
  return useQuery<DesignRunDetail>({
    queryKey: ['design-run', companyId, runId],
    enabled: Boolean(companyId && runId),
    queryFn: async () => {
      if (!runId) {
        throw new Error('Run ID is required');
      }
      const response = await api.get<DesignRunDetailResponse>(`/api/design/runs/${runId}`);
      return normaliseDesignRunDetail(response.run);
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const isActive = data.status === 'pending' || data.status === 'running';
      return isActive ? 3000 : false;
    }
  });
};

export const useCreateDesignRunMutation = (companyId?: string, companySlug?: string) => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DesignRunCreateInput) => {
      const payload = {
        prompt: input.prompt,
        config: {
          name: input.name,
          variants: input.variants,
          style: input.style,
        },
      };
      return await api.post<DesignRunCreateResponse>(`/api/design/runs`, payload);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['design-runs', companyId] });
      const run = normaliseDesignRun(data.run);
      queryClient.setQueryData(['design-run', companyId, run.id], run);
    }
  });
};

export const useDeleteDesignRunMutation = (companyId?: string, companySlug?: string) => {
  const api = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (runId: string) => {
      return await api.delete(`/api/design/runs/${runId}`);
    },
    onMutate: async (runId) => {
      await queryClient.cancelQueries({ queryKey: ['design-runs', companyId] });
      const previousRuns = queryClient.getQueryData<DesignRun[]>(['design-runs', companyId]);

      queryClient.setQueryData<DesignRun[]>(['design-runs', companyId], (old = []) =>
        old.filter((run) => run.id !== runId)
      );

      return { previousRuns };
    },
    onError: (err, runId, context) => {
      if (context?.previousRuns) {
        queryClient.setQueryData(['design-runs', companyId], context.previousRuns);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['design-runs', companyId] });
    }
  });
};
