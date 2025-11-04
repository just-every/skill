import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Button, ScrollView, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { PlaceholderCard } from '@justevery/ui';
import { useLogto } from '@logto/react';

import {
  LOGTO_API_RESOURCE,
  WORKER_ORIGIN,
  workerUrl,
} from './_components/RouteRedirect';
import { useLogtoReady } from './_providers/LogtoProvider';

type AssetObject = {
  key: string;
  size: number;
  uploaded: string | null;
};

type SessionPayload = {
  email_address?: string | null;
  session_id?: string;
  expires_at?: string;
};

type SessionResponse = {
  authenticated: boolean;
  session: SessionPayload | null;
};

type AsyncState<T> =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'success'; data: T }
  | { state: 'error'; error: string };

const SESSION_ENDPOINT = '/api/session';
const ASSET_LIST_ENDPOINT = '/api/assets/list?prefix=uploads/';

export default function AppScreen(): JSX.Element {
  const ready = useLogtoReady();

  if (!ready) {
    return <AppLoading />;
  }

  return <AppReady />;
}

function AppReady(): JSX.Element {
  const { isAuthenticated, getAccessToken } = useLogto();
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [serverSessionState, setServerSessionState] = useState<AsyncState<SessionResponse>>({ state: 'idle' });
  const [assetsState, setAssetsState] = useState<AsyncState<AssetObject[]>>({ state: 'idle' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<AsyncState<null>>({ state: 'idle' });
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAccessToken() {
      if (!isAuthenticated) {
        setAccessToken(null);
        return;
      }

      try {
        const resource = LOGTO_API_RESOURCE || undefined;
        const token = await getAccessToken(resource);
        if (!cancelled) {
          setAccessToken(token ?? null);
        }
      } catch (error) {
        console.error('Failed to resolve Logto access token', error);
        if (!cancelled) {
          setAccessToken(null);
        }
      }
    }

    void fetchAccessToken();

    return () => {
      cancelled = true;
    };
  }, [getAccessToken, isAuthenticated]);

  const authHeaders = useMemo(() => {
    if (!accessToken) return undefined;
    return {
      Authorization: `Bearer ${accessToken}`,
    } satisfies HeadersInit;
  }, [accessToken]);

  const fetchServerSession = useCallback(async () => {
    if (!WORKER_ORIGIN) {
      setServerSessionState({
        state: 'error',
        error: 'Configure EXPO_PUBLIC_WORKER_ORIGIN to talk to the Worker.',
      });
      return;
    }

    if (!authHeaders) {
      setServerSessionState({ state: 'idle' });
      return;
    }

    setServerSessionState({ state: 'loading' });
    try {
      const response = await fetch(workerUrl(SESSION_ENDPOINT), {
        method: 'GET',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Session verification failed (${response.status})`);
      }

      const payload = (await response.json()) as SessionResponse;
      setServerSessionState({ state: 'success', data: payload });
    } catch (error) {
      setServerSessionState({ state: 'error', error: (error as Error).message });
    }
  }, [authHeaders]);

  const fetchAssets = useCallback(async () => {
    if (!WORKER_ORIGIN) {
      setAssetsState({ state: 'error', error: 'Worker origin not configured.' });
      return;
    }
    if (!authHeaders) {
      setAssetsState({ state: 'idle' });
      return;
    }

    setAssetsState({ state: 'loading' });
    try {
      const response = await fetch(workerUrl(ASSET_LIST_ENDPOINT), {
        headers: authHeaders,
      });
      if (!response.ok) {
        throw new Error(`Asset list failed (${response.status})`);
      }
      const payload = (await response.json()) as { objects?: AssetObject[] };
      setAssetsState({ state: 'success', data: payload.objects ?? [] });
    } catch (error) {
      setAssetsState({ state: 'error', error: (error as Error).message });
    }
  }, [authHeaders]);

  useEffect(() => {
    void fetchServerSession();
    void fetchAssets();
  }, [fetchServerSession, fetchAssets]);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setSelectedFile(file ?? null);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) {
      setUploadStatus({ state: 'error', error: 'Select a file first.' });
      setUploadError('Select a file first.');
      return;
    }
    if (!authHeaders) {
      setUploadStatus({ state: 'error', error: 'You must be signed in before uploading.' });
      return;
    }

    setUploadStatus({ state: 'loading' });
    setUploadError(null);
    try {
      const key = `uploads/${selectedFile.name}`;
      const response = await fetch(workerUrl(`/api/assets/put?key=${encodeURIComponent(key)}`), {
        method: 'PUT',
        headers: {
          ...authHeaders,
          ...(selectedFile.type ? { 'Content-Type': selectedFile.type } : {}),
        },
        body: selectedFile,
      });
      if (!response.ok) {
        throw new Error(`Upload failed (${response.status})`);
      }
      setUploadStatus({ state: 'success', data: null });
      setSelectedFile(null);
      await fetchAssets();
    } catch (error) {
      const message = (error as Error).message;
      setUploadStatus({ state: 'error', error: message });
      setUploadError(message);
    }
  }, [authHeaders, fetchAssets, selectedFile]);

  if (!sessionJwt) {
    return (
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingVertical: 48,
          paddingHorizontal: 24,
          backgroundColor: '#020617',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            maxWidth: 640,
            width: '100%',
            alignSelf: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            borderRadius: 32,
            borderWidth: 1,
            borderColor: 'rgba(59, 130, 246, 0.25)',
            padding: 32,
            gap: 16,
          }}
        >
          <Text style={{ color: '#e2e8f0', fontSize: 26, fontWeight: '700' }}>Sign in to continue</Text>
          <Text style={{ color: '#94a3b8' }}>
            Use the Logto login screen to obtain a session. Once authenticated, your requests will include a bearer token
            that the Worker validates against Logto before returning data.
          </Text>
          <Link
            href="/login"
            style={{
              backgroundColor: '#38bdf8',
              color: '#0f172a',
              paddingVertical: 12,
              paddingHorizontal: 18,
              borderRadius: 12,
              fontWeight: '600',
              textAlign: 'center',
              alignSelf: 'flex-start',
              textDecorationLine: 'none',
            }}
          >
            Go to login
          </Link>
        </View>
      </ScrollView>
    );
  }

  const serverSession = serverSessionState.state === 'success' ? serverSessionState.data : null;

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        paddingVertical: 48,
        paddingHorizontal: 24,
        backgroundColor: '#020617',
      }}
    >
      <View
        style={{
          maxWidth: 960,
          width: '100%',
          alignSelf: 'center',
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          borderRadius: 32,
          borderWidth: 1,
          borderColor: 'rgba(59, 130, 246, 0.25)',
          padding: 32,
          gap: 24,
        }}
      >
        <View style={{ gap: 8 }}>
          <Text style={{ color: '#e2e8f0', fontSize: 26, fontWeight: '700' }}>Welcome back</Text>
          <Text style={{ color: '#94a3b8' }}>
            The Worker verifies your Logto session on every request using the bearer token issued by the frontend SDK.
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          <PlaceholderCard
            title="Email"
            description={serverSession?.session?.email_address ?? 'Unknown user'}
          />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <Link
            href="/payments"
            style={{
              backgroundColor: '#38bdf8',
              color: '#0f172a',
              paddingVertical: 12,
              paddingHorizontal: 18,
              borderRadius: 12,
              fontWeight: '600',
              textDecorationLine: 'none',
              textAlign: 'center',
              minWidth: 160,
            }}
          >
            View Stripe preview
          </Link>
          <Link
            href="/logout"
            style={{
              borderColor: '#38bdf8',
              borderWidth: 1,
              color: '#e2e8f0',
              paddingVertical: 12,
              paddingHorizontal: 18,
              borderRadius: 12,
              fontWeight: '600',
              textDecorationLine: 'none',
              textAlign: 'center',
              minWidth: 160,
            }}
          >
            Sign out
          </Link>
        </View>

        <View
          style={{
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            borderRadius: 20,
            borderWidth: 1,
            borderColor: 'rgba(59, 130, 246, 0.35)',
            padding: 20,
            gap: 16,
          }}
        >
          <View style={{ gap: 4 }}>
            <Text style={{ color: '#e2e8f0', fontSize: 20, fontWeight: '600' }}>Storage demo (R2)</Text>
            <Text style={{ color: '#94a3b8' }}>
              Files under <Text style={{ fontWeight: '600' }}>uploads/</Text> require a valid Logto session. The Worker
              checks your bearer token before streaming anything from R2.
            </Text>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <Button title="Refresh" onPress={() => void fetchAssets()} disabled={assetsState.state === 'loading'} />
            {assetsState.state === 'loading' ? (
              <ActivityIndicator color="#38bdf8" />
            ) : assetsState.state === 'error' ? (
              <Text style={{ color: '#f87171' }}>{assetsState.error}</Text>
            ) : null}
          </View>

          {assetsState.state === 'success' && assetsState.data.length === 0 ? (
            <Text style={{ color: '#94a3b8' }}>No uploaded files yet.</Text>
          ) : null}

          {assetsState.state === 'success' && assetsState.data.length > 0 ? (
            <View style={{ gap: 8 }}>
              {assetsState.data.map((object) => (
                <View
                  key={object.key}
                  style={{
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: 'rgba(148, 163, 184, 0.2)',
                    padding: 12,
                    backgroundColor: 'rgba(15, 23, 42, 0.4)',
                  }}
                >
                  <Text style={{ color: '#e2e8f0', fontWeight: '600' }}>{object.key}</Text>
                  <Text style={{ color: '#94a3b8', fontSize: 12 }}>
                    {(object.size / 1024).toFixed(1)} kB • {object.uploaded ? new Date(object.uploaded).toUTCString() : 'unknown timestamp'}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={{ gap: 12 }}>
            <input type="file" onChange={handleFileChange} accept="*" />
            <Button
              title={uploadStatus.state === 'loading' ? 'Uploading…' : 'Upload to uploads/'}
              onPress={() => void handleUpload()}
              disabled={!selectedFile || uploadStatus.state === 'loading'}
            />
            {uploadError ? <Text style={{ color: '#f87171' }}>{uploadError}</Text> : null}
            {uploadStatus.state === 'success' ? <Text style={{ color: '#4ade80' }}>Upload complete.</Text> : null}
          </View>
        </View>

        {serverSessionState.state === 'loading' ? (
          <View style={{ gap: 8 }}>
            <Text style={{ color: '#94a3b8' }}>Verifying session with the Worker…</Text>
            <ActivityIndicator color="#38bdf8" />
          </View>
        ) : serverSessionState.state === 'error' ? (
          <Text style={{ color: '#f87171' }}>{serverSessionState.error}</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

function AppLoading(): JSX.Element {
  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        paddingVertical: 48,
        paddingHorizontal: 24,
        backgroundColor: '#020617',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          gap: 12,
          alignItems: 'center',
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          borderRadius: 32,
          borderWidth: 1,
          borderColor: 'rgba(59, 130, 246, 0.25)',
          padding: 32,
          maxWidth: 640,
          width: '100%',
        }}
      >
        <ActivityIndicator color="#38bdf8" />
        <Text style={{ color: '#cbd5f5' }}>Loading workspace…</Text>
      </View>
    </ScrollView>
  );
}
