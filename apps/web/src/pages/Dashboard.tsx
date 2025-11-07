import type { ChangeEvent } from 'react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Button, Pressable, ScrollView, Text, View } from 'react-native';

import { useLogto } from '../auth/LogtoProvider';

import { useAuthConfig } from '../auth/AuthConfig';
import { usePublicEnv } from '../runtimeEnv';

type SessionResponse = {
  authenticated: boolean;
  sessionId: string | null;
  expiresAt: string | null;
  emailAddress: string | null;
};

type AssetObject = {
  key: string;
  size: number;
  uploaded: string | null;
};

type AccountBranding = {
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string;
  logoUrl?: string;
  tagline?: string;
  updatedAt?: string;
};

type AccountSummary = {
  id: string;
  slug: string;
  name: string;
  plan: string;
  industry: string;
  createdAt: string;
  billingEmail: string;
  stats: {
    activeMembers: number;
    pendingInvites: number;
    mrr: number;
    seats: number;
  };
  branding: AccountBranding;
};

type AccountMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  joinedAt: string;
  lastActiveAt: string | null;
};

type BrandingFormState = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string;
  tagline: string;
};

type JsonRecord = Record<string, unknown>;

type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; data: T };

const SESSION_ENDPOINT = '/api/session';
const ASSET_LIST_ENDPOINT = '/api/assets/list?prefix=uploads/';
const ACCOUNTS_ENDPOINT = '/api/accounts';

const resolveWorkerOrigin = (env: ReturnType<typeof usePublicEnv>) => {
  if (env.workerOrigin) {
    return env.workerOrigin;
  }
  if (env.workerOriginLocal) {
    return env.workerOriginLocal;
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return undefined;
};

const buildWorkerUrl = (env: ReturnType<typeof usePublicEnv>, path: string) => {
  const origin = resolveWorkerOrigin(env);
  if (!origin) {
    return path;
  }
  try {
    return new URL(path, origin).toString();
  } catch {
    const trimmedOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return `${trimmedOrigin}${suffix}`;
  }
};

const Dashboard = () => {
  const env = usePublicEnv();
  const authConfig = useAuthConfig();
  const {
    isAuthenticated,
    isInitialized,
    getAccessToken,
    getIdTokenClaims,
    fetchUserInfo,
    signIn,
    signOut,
    mode: authMode
  } = useLogto();
  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }),
    []
  );

  const [tokenState, setTokenState] = useState<AsyncState<string>>({ status: 'idle' });
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<AsyncState<SessionResponse>>({ status: 'idle' });
  const [assetsState, setAssetsState] = useState<AsyncState<AssetObject[]>>({ status: 'idle' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<AsyncState<null>>({ status: 'idle' });
  const [accountsState, setAccountsState] = useState<AsyncState<AccountSummary[]>>({ status: 'idle' });
  const [membersState, setMembersState] = useState<AsyncState<AccountMember[]>>({ status: 'idle' });
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [brandingForm, setBrandingForm] = useState<BrandingFormState>({
    primaryColor: '#0f172a',
    secondaryColor: '#38bdf8',
    accentColor: '#facc15',
    logoUrl: '',
    tagline: ''
  });
  const [brandingState, setBrandingState] = useState<AsyncState<null>>({ status: 'idle' });
  const [claimsState, setClaimsState] = useState<AsyncState<JsonRecord>>({ status: 'idle' });
  const [userInfoState, setUserInfoState] = useState<AsyncState<JsonRecord>>({ status: 'idle' });
  const [resourceTokensState, setResourceTokensState] = useState<AsyncState<Record<string, string>>>({
    status: 'idle'
  });

  const workerOrigin = resolveWorkerOrigin(env);
  const trackedResources = useMemo(() => {
    if (env.resources.length > 0) {
      return env.resources;
    }
    return env.apiResource ? [env.apiResource] : [];
  }, [env.apiResource, env.resources]);
  const selectedAccount = useMemo(() => {
    if (accountsState.status !== 'success' || accountsState.data.length === 0) {
      return null;
    }
    return (
      accountsState.data.find((account) => account.id === selectedAccountId) ??
      accountsState.data[0]
    );
  }, [accountsState, selectedAccountId]);

  const accessToken = tokenState.status === 'success' ? tokenState.data : null;
  const authHeaders = useMemo(() => {
    if (!accessToken) {
      return undefined;
    }
    return {
      Authorization: `Bearer ${accessToken}`
    } satisfies HeadersInit;
  }, [accessToken]);

  const refreshAccessToken = useCallback(async () => {
    if (!isAuthenticated) {
      setTokenState({ status: 'idle' });
      setTokenError(null);
      return;
    }

    if (!env.apiResource) {
      setTokenState({ status: 'idle' });
      setTokenError('Configure EXPO_PUBLIC_API_RESOURCE to request a bearer token.');
      return;
    }

    setTokenState({ status: 'loading' });
    setTokenError(null);
    try {
      const token = await getAccessToken(env.apiResource);
      if (!token) {
        setTokenState({ status: 'error', error: 'Logto returned an empty access token.' });
        setTokenError('Logto did not return a token. Check scopes and API resource audiences.');
        return;
      }
      setTokenState({ status: 'success', data: token });
    } catch (error) {
      console.error('Failed to fetch Logto access token', error);
      setTokenState({ status: 'error', error: 'Failed to fetch Logto access token.' });
      setTokenError('Verify Logto application credentials in .env.local.generated.');
    }
  }, [env.apiResource, getAccessToken, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setClaimsState({ status: 'idle' });
      setUserInfoState({ status: 'idle' });
      setResourceTokensState({ status: 'idle' });
      return;
    }

    let cancelled = false;

    const loadClaims = async (): Promise<void> => {
      setClaimsState({ status: 'loading' });
      try {
        const claims = (await getIdTokenClaims()) ?? {};
        if (!cancelled) {
          setClaimsState({ status: 'success', data: claims });
        }
      } catch (error) {
        if (!cancelled) {
          setClaimsState({ status: 'error', error: (error as Error).message });
        }
      }
    };

    const loadUserInfo = async (): Promise<void> => {
      setUserInfoState({ status: 'loading' });
      try {
        const info = (await fetchUserInfo()) as JsonRecord;
        if (!cancelled) {
          setUserInfoState({ status: 'success', data: info ?? {} });
        }
      } catch (error) {
        if (!cancelled) {
          setUserInfoState({ status: 'error', error: (error as Error).message });
        }
      }
    };

    const loadResourceTokens = async (): Promise<void> => {
      if (trackedResources.length === 0) {
        setResourceTokensState({ status: 'idle' });
        return;
      }
      setResourceTokensState({ status: 'loading' });
      try {
        const pairs: Array<[string, string]> = [];
        for (const resource of trackedResources) {
          const token = await getAccessToken(resource);
          if (token) {
            pairs.push([resource, token]);
          }
        }
        if (!cancelled) {
          setResourceTokensState({ status: 'success', data: Object.fromEntries(pairs) });
        }
      } catch (error) {
        if (!cancelled) {
          setResourceTokensState({ status: 'error', error: (error as Error).message });
        }
      }
    };

    void loadClaims();
    void loadUserInfo();
    void loadResourceTokens();

    return () => {
      cancelled = true;
    };
  }, [fetchUserInfo, getAccessToken, getIdTokenClaims, isAuthenticated, trackedResources]);

  const fetchSession = useCallback(async () => {
    if (!workerOrigin) {
      setSessionState({ status: 'error', error: 'Provide EXPO_PUBLIC_WORKER_ORIGIN to contact the Worker.' });
      return;
    }
    if (!authHeaders) {
      setSessionState({ status: 'idle' });
      return;
    }

    setSessionState({ status: 'loading' });
    try {
      const response = await fetch(buildWorkerUrl(env, SESSION_ENDPOINT), {
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error(`Session verification failed (${response.status})`);
      }
      const payload = (await response.json()) as SessionResponse;
      setSessionState({ status: 'success', data: payload });
    } catch (error) {
      setSessionState({ status: 'error', error: (error as Error).message });
    }
  }, [authHeaders, env, workerOrigin]);

  const fetchAssets = useCallback(async () => {
    if (!workerOrigin) {
      setAssetsState({ status: 'error', error: 'Worker origin is not configured.' });
      return;
    }
    if (!authHeaders) {
      setAssetsState({ status: 'idle' });
      return;
    }

    setAssetsState({ status: 'loading' });
    try {
      const response = await fetch(buildWorkerUrl(env, ASSET_LIST_ENDPOINT), {
        headers: authHeaders
      });
      if (!response.ok) {
        try {
          const payload = (await response.json()) as { error?: string; hint?: string };
          if (payload?.error === 'storage_not_configured' && payload.hint) {
            throw new Error(payload.hint);
          }
        } catch {
          // ignore parse issues and fall through to default error
        }
        throw new Error(`Asset listing failed (${response.status})`);
      }
      const payload = (await response.json()) as { objects?: AssetObject[] };
      setAssetsState({ status: 'success', data: payload.objects ?? [] });
    } catch (error) {
      setAssetsState({ status: 'error', error: (error as Error).message });
    }
  }, [authHeaders, env, workerOrigin]);

  const fetchAccounts = useCallback(async () => {
    if (!authHeaders) {
      setAccountsState({ status: 'idle' });
      return;
    }

    setAccountsState({ status: 'loading' });
    try {
      const response = await fetch(buildWorkerUrl(env, ACCOUNTS_ENDPOINT), {
        headers: authHeaders
      });
      if (!response.ok) {
        throw new Error(`Accounts request failed (${response.status})`);
      }
      const payload = (await response.json()) as {
        accounts: AccountSummary[];
        currentAccountId: string | null;
      };
      setAccountsState({ status: 'success', data: payload.accounts });
      setSelectedAccountId((prev) => prev ?? payload.currentAccountId ?? payload.accounts[0]?.id ?? null);
    } catch (error) {
      setAccountsState({ status: 'error', error: (error as Error).message });
    }
  }, [authHeaders, env]);

  const fetchMembers = useCallback(
    async (account: AccountSummary | null) => {
      if (!authHeaders || !account) {
        setMembersState({ status: 'idle' });
        return;
      }

      setMembersState({ status: 'loading' });
      try {
        const response = await fetch(
          buildWorkerUrl(env, `/api/accounts/${account.slug}/members`),
          {
            headers: authHeaders
          }
        );
        if (!response.ok) {
          throw new Error(`Members request failed (${response.status})`);
        }
        const payload = (await response.json()) as { members: AccountMember[] };
        setMembersState({ status: 'success', data: payload.members });
      } catch (error) {
        setMembersState({ status: 'error', error: (error as Error).message });
      }
    },
    [authHeaders, env]
  );

  useEffect(() => {
    if (!isInitialized) {
      return;
    }
    void refreshAccessToken();
  }, [isInitialized, refreshAccessToken]);

  useEffect(() => {
    if (!isAuthenticated) {
      setSessionState({ status: 'idle' });
      setAssetsState({ status: 'idle' });
      return;
    }
    if (authHeaders) {
      void fetchSession();
      void fetchAssets();
    }
  }, [authHeaders, fetchAssets, fetchSession, isAuthenticated]);

  useEffect(() => {
    if (!authHeaders) {
      setAccountsState({ status: 'idle' });
      setMembersState({ status: 'idle' });
      return;
    }
    void fetchAccounts();
  }, [authHeaders, fetchAccounts]);

  useEffect(() => {
    if (accountsState.status !== 'success' || accountsState.data.length === 0) {
      return;
    }
    const account =
      accountsState.data.find((candidate) => candidate.id === selectedAccountId) ??
      accountsState.data[0];
    if (selectedAccountId !== account.id) {
      setSelectedAccountId(account.id);
    }
  }, [accountsState, selectedAccountId]);

  useEffect(() => {
    if (!authHeaders || !selectedAccount) {
      setMembersState({ status: 'idle' });
      return;
    }
    void fetchMembers(selectedAccount);
  }, [authHeaders, fetchMembers, selectedAccount]);

  useEffect(() => {
    if (accountsState.status !== 'success' || !selectedAccount) {
      return;
    }
    const branding = selectedAccount.branding;
    setBrandingForm((prev) => {
      if (
        prev.primaryColor === branding.primaryColor &&
        prev.secondaryColor === branding.secondaryColor &&
        prev.accentColor === (branding.accentColor ?? prev.accentColor) &&
        prev.logoUrl === (branding.logoUrl ?? '') &&
        prev.tagline === (branding.tagline ?? '')
      ) {
        return prev;
      }
      return {
        primaryColor: branding.primaryColor,
        secondaryColor: branding.secondaryColor,
        accentColor: branding.accentColor ?? '#38bdf8',
        logoUrl: branding.logoUrl ?? '',
        tagline: branding.tagline ?? ''
      };
    });
  }, [accountsState, selectedAccount]);

  useEffect(() => {
    if (brandingState.status !== 'success') {
      return;
    }
    const timer = setTimeout(() => {
      setBrandingState({ status: 'idle' });
    }, 2400);
    return () => clearTimeout(timer);
  }, [brandingState]);

  const handleSignIn = useCallback(async () => {
    try {
      const isLocalHost = typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const redirect = isLocalHost
        ? authConfig.redirectUriLocal ?? authConfig.redirectUri
        : authConfig.redirectUriProd ?? authConfig.redirectUri;
      if (authMode === 'redirect') {
        signIn(redirect);
        return;
      }
      await signIn(redirect);
    } catch (error) {
      console.error('Logto sign-in failed', error);
    }
  }, [authConfig.redirectUri, authConfig.redirectUriLocal, authConfig.redirectUriProd, authMode, signIn]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut(authConfig.logoutRedirectUri);
      setSelectedFile(null);
      setUploadState({ status: 'idle' });
    } catch (error) {
      console.error('Logto sign-out failed', error);
    }
  }, [authConfig.logoutRedirectUri, signOut]);

  const handleApplyUserProfileBranding = useCallback(() => {
    if (userInfoState.status !== 'success') {
      return;
    }
    const info = userInfoState.data;
    const displayName =
      (info.name as string | undefined) ??
      (info.preferred_username as string | undefined) ??
      (info.email as string | undefined);
    if (!displayName) {
      return;
    }
    setBrandingForm((prev) => ({
      ...prev,
      tagline: `Curated for ${displayName}`
    }));
  }, [userInfoState]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
  };

  const handleUpload = useCallback(async () => {
    if (!selectedFile) {
      setUploadState({ status: 'error', error: 'Pick a file to upload.' });
      return;
    }
    if (!authHeaders) {
      setUploadState({ status: 'error', error: 'Authenticate before uploading assets.' });
      return;
    }
    if (!workerOrigin) {
      setUploadState({ status: 'error', error: 'Worker origin not configured.' });
      return;
    }

    setUploadState({ status: 'loading' });
    try {
      const key = `uploads/${selectedFile.name}`;
      const response = await fetch(buildWorkerUrl(env, `/api/assets/put?key=${encodeURIComponent(key)}`), {
        method: 'PUT',
        headers: {
          ...authHeaders,
          ...(selectedFile.type ? { 'Content-Type': selectedFile.type } : {})
        },
        body: selectedFile
      });
      if (!response.ok) {
        throw new Error(`Upload failed (${response.status})`);
      }
      setUploadState({ status: 'success', data: null });
      setSelectedFile(null);
      await fetchAssets();
    } catch (error) {
      setUploadState({ status: 'error', error: (error as Error).message });
    }
  }, [authHeaders, env, fetchAssets, selectedFile, workerOrigin]);

  const handleBrandingSubmit = useCallback(async () => {
    if (!authHeaders || !selectedAccount) {
      return;
    }

    setBrandingState({ status: 'loading' });
    try {
      const response = await fetch(
        buildWorkerUrl(env, `/api/accounts/${selectedAccount.slug}/branding`),
        {
          method: 'PATCH',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            primaryColor: brandingForm.primaryColor,
            secondaryColor: brandingForm.secondaryColor,
            accentColor: brandingForm.accentColor,
            logoUrl: brandingForm.logoUrl || undefined,
            tagline: brandingForm.tagline
          })
        }
      );
      if (!response.ok) {
        throw new Error(`Branding update failed (${response.status})`);
      }
      setBrandingState({ status: 'success', data: null });
      await fetchAccounts();
    } catch (error) {
      setBrandingState({ status: 'error', error: (error as Error).message });
    }
  }, [authHeaders, brandingForm, env, fetchAccounts, selectedAccount]);

  const session = sessionState.status === 'success' ? sessionState.data : null;

  const renderAssets = () => {
    if (assetsState.status === 'idle') {
      return <Text style={{ color: '#94a3b8' }}>Authenticate to list protected uploads.</Text>;
    }
    if (assetsState.status === 'loading') {
      return (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <ActivityIndicator color="#38bdf8" />
          <Text style={{ color: '#94a3b8' }}>Fetching asset inventory…</Text>
        </View>
      );
    }
    if (assetsState.status === 'error') {
      return <Text style={{ color: '#f87171' }}>{assetsState.error}</Text>;
    }
    if (assetsState.data.length === 0) {
      return <Text style={{ color: '#94a3b8' }}>No files uploaded yet.</Text>;
    }
    return (
      <View style={{ gap: 8 }}>
        {assetsState.data.map((asset) => (
          <View
            key={asset.key}
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: 'rgba(148,163,184,0.25)',
              padding: 12,
              backgroundColor: '#ffffff'
            }}
          >
            <Text style={{ color: '#0f172a', fontWeight: '600' }}>{asset.key}</Text>
            <Text style={{ color: '#64748b', fontSize: 12 }}>
              {(asset.size / 1024).toFixed(1)} kB •{' '}
              {asset.uploaded ? new Date(asset.uploaded).toLocaleString() : 'unknown timestamp'}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const sectionCardStyle = {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 16
  } as const;

  const renderJsonState = (state: AsyncState<JsonRecord>, emptyHint: string) => {
    if (state.status === 'loading') {
      return (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <ActivityIndicator color="#38bdf8" />
          <Text style={{ color: '#64748b' }}>Loading…</Text>
        </View>
      );
    }
    if (state.status === 'error') {
      return <Text style={{ color: '#f87171' }}>{state.error}</Text>;
    }
    if (state.status === 'success') {
      return (
        <View
          style={{
            backgroundColor: '#0f172a',
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor: 'rgba(148,163,184,0.4)'
          }}
        >
          <Text style={{ color: '#e2e8f0', fontFamily: 'monospace', fontSize: 12 }}>
            {JSON.stringify(state.data, null, 2)}
          </Text>
        </View>
      );
    }
    return <Text style={{ color: '#94a3b8' }}>{emptyHint}</Text>;
  };

  const formatTokenPreview = (token: string): string => {
    const slice = token.slice(0, 28);
    return `${slice}… (${token.length} chars)`;
  };

  const renderResourceTokenState = (
    state: AsyncState<Record<string, string>>,
    resources: string[]
  ) => {
    if (state.status === 'loading') {
      return (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <ActivityIndicator color="#38bdf8" />
          <Text style={{ color: '#64748b' }}>Fetching tokens…</Text>
        </View>
      );
    }
    if (state.status === 'error') {
      return <Text style={{ color: '#f87171' }}>{state.error}</Text>;
    }
    if (state.status === 'success') {
      return (
        <View style={{ gap: 12 }}>
          {resources.map((resource) => {
            const token = state.data[resource];
            return (
              <View key={resource} style={{ gap: 4 }}>
                <Text style={{ color: '#0f172a', fontWeight: '600' }}>{resource}</Text>
                {token ? (
                  <Text style={{ color: '#475569', fontFamily: 'monospace' }}>
                    {formatTokenPreview(token)}
                  </Text>
                ) : (
                  <Text style={{ color: '#94a3b8' }}>No token returned; check scopes/resources.</Text>
                )}
              </View>
            );
          })}
        </View>
      );
    }
    return <Text style={{ color: '#94a3b8' }}>Sign in to request scoped access tokens.</Text>;
  };

  const renderAccountsSection = () => {
    if (accountsState.status === 'idle' && !isAuthenticated) {
      return null;
    }

    const content = (() => {
      if (accountsState.status === 'loading') {
        return (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <ActivityIndicator color="#38bdf8" />
            <Text style={{ color: '#64748b' }}>Loading organizations…</Text>
          </View>
        );
      }
      if (accountsState.status === 'error') {
        return <Text style={{ color: '#f87171' }}>{accountsState.error}</Text>;
      }
      if (!selectedAccount) {
        return <Text style={{ color: '#94a3b8' }}>No accounts available.</Text>;
      }
      return (
        <View style={{ gap: 16 }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: selectedAccount.branding.primaryColor,
                borderWidth: 2,
                borderColor: selectedAccount.branding.secondaryColor
              }}
            />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '600' }}>{selectedAccount.name}</Text>
              <Text style={{ color: '#64748b', fontSize: 13 }}>
                {selectedAccount.plan} plan • {selectedAccount.industry}
              </Text>
            </View>
          </View>
          {selectedAccount.branding.tagline ? (
            <Text style={{ color: '#475569' }}>{selectedAccount.branding.tagline}</Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {[
              { label: 'Active members', value: selectedAccount.stats.activeMembers.toString() },
              { label: 'Pending invites', value: selectedAccount.stats.pendingInvites.toString() },
              { label: 'Seats', value: `${selectedAccount.stats.seats}` },
              { label: 'MRR', value: currencyFormatter.format(selectedAccount.stats.mrr) }
            ].map((stat) => (
              <View
                key={stat.label}
                style={{
                  flexGrow: 1,
                  minWidth: 140,
                  backgroundColor: 'rgba(148,163,184,0.1)',
                  borderRadius: 16,
                  padding: 16,
                  gap: 4
                }}
              >
                <Text style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                  {stat.label}
                </Text>
                <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '700' }}>{stat.value}</Text>
              </View>
            ))}
          </View>
        </View>
      );
    })();

    return (
      <View style={sectionCardStyle}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '600' }}>Organizations</Text>
          {accountsState.status === 'success' && accountsState.data.length > 1 ? (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {accountsState.data.map((account) => {
                const isActive = account.id === selectedAccount?.id;
                return (
                  <Pressable
                    key={account.id}
                    onPress={() => setSelectedAccountId(account.id)}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: isActive ? '#0f172a' : '#cbd5f5',
                      backgroundColor: isActive ? 'rgba(15,23,42,0.08)' : 'transparent'
                    }}
                  >
                    <Text style={{ color: isActive ? '#0f172a' : '#475569', fontWeight: '600' }}>{account.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
        {content}
      </View>
    );
  };

  const renderBrandingSection = () => {
    if (!selectedAccount) {
      return null;
    }
    return (
      <View style={sectionCardStyle}>
        <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '600' }}>Branding controls</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          {[
            { label: 'Primary', key: 'primaryColor', type: 'color' },
            { label: 'Secondary', key: 'secondaryColor', type: 'color' },
            { label: 'Accent', key: 'accentColor', type: 'color' }
          ].map((field) => (
            <View key={field.key} style={{ width: 160, gap: 4 }}>
              <Text style={{ color: '#475569', fontSize: 12 }}>{field.label}</Text>
              <input
                type="color"
                value={brandingForm[field.key as keyof BrandingFormState] as string}
                onChange={(event) =>
                  setBrandingForm((prev) => ({
                    ...prev,
                    [field.key]: event.target.value
                  }))
                }
                style={{ width: '100%', height: 48, borderRadius: 12, borderWidth: 0 }}
              />
            </View>
          ))}
          <View style={{ flex: 1, minWidth: 240, gap: 4 }}>
            <Text style={{ color: '#475569', fontSize: 12 }}>Logo URL</Text>
            <input
              type="url"
              value={brandingForm.logoUrl}
              onChange={(event) =>
                setBrandingForm((prev) => ({
                  ...prev,
                  logoUrl: event.target.value
                }))
              }
              placeholder="https://"
              style={{
                borderRadius: 12,
                border: '1px solid #cbd5f5',
                padding: '10px 12px',
                fontSize: 14
              }}
            />
          </View>
          <View style={{ flex: 1, minWidth: 240, gap: 4 }}>
            <Text style={{ color: '#475569', fontSize: 12 }}>Tagline</Text>
            <input
              type="text"
              value={brandingForm.tagline}
              onChange={(event) =>
                setBrandingForm((prev) => ({
                  ...prev,
                  tagline: event.target.value
                }))
              }
              placeholder="Short customer-facing message"
              style={{
                borderRadius: 12,
                border: '1px solid #cbd5f5',
                padding: '10px 12px',
                fontSize: 14
              }}
            />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Button
            title={brandingState.status === 'loading' ? 'Saving…' : 'Save branding'}
            onPress={() => void handleBrandingSubmit()}
            disabled={brandingState.status === 'loading'}
          />
          <Button
            title="Use profile name"
            onPress={handleApplyUserProfileBranding}
            disabled={userInfoState.status !== 'success'}
          />
          {brandingState.status === 'success' ? (
            <Text style={{ color: '#16a34a' }}>Updated just now.</Text>
          ) : null}
          {brandingState.status === 'error' ? (
            <Text style={{ color: '#f87171' }}>{brandingState.error}</Text>
          ) : null}
        </View>
      </View>
    );
  };

  const renderMembersSection = () => {
    if (!selectedAccount) {
      return null;
    }
    return (
      <View style={sectionCardStyle}>
        <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '600' }}>Team members</Text>
        {membersState.status === 'loading' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color="#38bdf8" />
            <Text style={{ color: '#64748b' }}>Loading members…</Text>
          </View>
        ) : membersState.status === 'error' ? (
          <Text style={{ color: '#f87171' }}>{membersState.error}</Text>
        ) : membersState.status === 'success' ? (
          <View style={{ gap: 8 }}>
            {membersState.data.map((member) => (
              <View
                key={member.id}
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(148,163,184,0.3)',
                  padding: 12,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <View style={{ gap: 2 }}>
                  <Text style={{ color: '#0f172a', fontWeight: '600' }}>{member.name}</Text>
                  <Text style={{ color: '#475569', fontSize: 12 }}>{member.email}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={{ color: '#0f172a', fontWeight: '600' }}>{member.role}</Text>
                  <Text style={{ color: '#94a3b8', fontSize: 12 }}>
                    {member.lastActiveAt
                      ? `Active ${new Date(member.lastActiveAt).toLocaleDateString()}`
                      : 'No activity yet'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ color: '#94a3b8' }}>Select an account to view members.</Text>
        )}
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, gap: 24 }}>
      <View
        style={{
          backgroundColor: '#0f172a',
          borderRadius: 28,
          padding: 28,
          gap: 18,
          borderWidth: 1,
          borderColor: 'rgba(59,130,246,0.35)'
        }}
      >
        <View style={{ gap: 6 }}>
          <Text style={{ color: '#38bdf8', textTransform: 'uppercase', letterSpacing: 3 }}>Dashboard</Text>
          <Text style={{ color: '#e2e8f0', fontSize: 26, fontWeight: '700' }}>Worker-protected data</Text>
          <Text style={{ color: '#cbd5f5', fontSize: 15, lineHeight: 22 }}>
            Logto issues tokens on the client while the Worker validates every request before streaming from R2 or D1.
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {isAuthenticated ? (
            <Button title="Sign out" onPress={() => void handleSignOut()} color="#f87171" />
          ) : (
            <Button title="Sign in with Logto" onPress={() => void handleSignIn()} />
          )}
          <Button
            title="Refresh session"
            onPress={() => {
              void refreshAccessToken().then(() => {
                void fetchSession();
                void fetchAssets();
              });
            }}
            disabled={!isAuthenticated}
          />
      </View>

      {tokenError ? <Text style={{ color: '#f87171' }}>{tokenError}</Text> : null}
    </View>

      {renderAccountsSection()}
      {renderBrandingSection()}
      {renderMembersSection()}
      <View style={sectionCardStyle}>
        <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '600' }}>Logto ID token claims</Text>
        {renderJsonState(claimsState, 'Sign in to view ID token claims returned by Logto.')}
      </View>
      <View style={sectionCardStyle}>
        <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '600' }}>Logto user info</Text>
        {renderJsonState(
          userInfoState,
          'Call fetchUserInfo() after authenticating to pull profile details from Logto.'
        )}
      </View>
      {trackedResources.length > 0 ? (
        <View style={sectionCardStyle}>
          <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '600' }}>API access tokens</Text>
          <Text style={{ color: '#64748b' }}>
            Tokens fetched via useLogto.getAccessToken(). Only the first few characters are shown for safety.
          </Text>
          {renderResourceTokenState(resourceTokensState, trackedResources)}
        </View>
      ) : null}

      <View style={sectionCardStyle}>
        <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '600' }}>Session details</Text>
        {sessionState.status === 'loading' ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <ActivityIndicator color="#38bdf8" />
            <Text style={{ color: '#64748b' }}>Verifying session with the Worker…</Text>
          </View>
        ) : sessionState.status === 'error' ? (
          <Text style={{ color: '#f87171' }}>{sessionState.error}</Text>
        ) : session ? (
          <View style={{ gap: 8 }}>
            <Text style={{ color: '#0f172a', fontWeight: '600' }}>
              Email:{' '}
              <Text style={{ color: '#475569', fontWeight: '400' }}>{session.emailAddress ?? 'Unknown user'}</Text>
            </Text>
            <Text style={{ color: '#0f172a', fontWeight: '600' }}>
              Session:{' '}
              <Text style={{ color: '#475569', fontWeight: '400' }}>{session.sessionId ?? 'N/A'}</Text>
            </Text>
            <Text style={{ color: '#0f172a', fontWeight: '600' }}>
              Expires:{' '}
              <Text style={{ color: '#475569', fontWeight: '400' }}>
                {session.expiresAt ? new Date(session.expiresAt).toLocaleString() : 'Unknown'}
              </Text>
            </Text>
          </View>
        ) : (
          <Text style={{ color: '#94a3b8' }}>Sign in to request the session endpoint.</Text>
        )}
      </View>

      <View style={sectionCardStyle}>
        <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '600' }}>Protected uploads (R2)</Text>
        <View style={{ gap: 12 }}>
          <Button
            title={uploadState.status === 'loading' ? 'Uploading…' : 'Upload selected file'}
            onPress={() => void handleUpload()}
            disabled={!selectedFile || uploadState.status === 'loading'}
          />
          <input type="file" onChange={onFileChange} />
          {uploadState.status === 'error' ? (
            <Text style={{ color: '#f87171' }}>{uploadState.error}</Text>
          ) : null}
          {uploadState.status === 'success' ? <Text style={{ color: '#16a34a' }}>Upload complete.</Text> : null}
        </View>
        {renderAssets()}
      </View>

      <View style={sectionCardStyle}>
        <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '600' }}>Environment signals</Text>
        <Text style={{ color: '#64748b' }}>Worker origin: {workerOrigin ?? 'not configured'}</Text>
        <Text style={{ color: '#64748b' }}>
          API resource: {env.apiResource ?? 'set EXPO_PUBLIC_API_RESOURCE to request scoped tokens'}
        </Text>
      </View>
    </ScrollView>
  );
};

export default Dashboard;
