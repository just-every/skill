import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Button, Platform, ScrollView, Text, View } from 'react-native';
import { PlaceholderCard } from '@justevery/ui';

import { WORKER_ORIGIN, WorkerLink, workerUrl } from './_components/RouteRedirect';

type SessionResponse = {
  authenticated: boolean;
  session: {
    id: string;
    created_at: string;
  } | null;
};

type AssetObject = {
  key: string;
  size: number;
  uploaded: string | null;
};

type AsyncState<T> =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'success'; data: T }
  | { state: 'error'; error: string };

const SESSION_ENDPOINT = '/api/session';
const ASSET_LIST_ENDPOINT = '/api/assets/list?prefix=uploads/';

export default function AppScreen() {
  const [sessionState, setSessionState] = useState<AsyncState<SessionResponse>>({ state: 'idle' });
  const [assetsState, setAssetsState] = useState<AsyncState<AssetObject[]>>({ state: 'idle' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<AsyncState<null>>({ state: 'idle' });
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!WORKER_ORIGIN) {
      setSessionState({
        state: 'error',
        error:
          'EXPO_PUBLIC_WORKER_ORIGIN is not set. Configure it to let the Expo client talk to the deployed Worker.',
      });
      return;
    }

    let cancelled = false;
    async function loadSession() {
      setSessionState({ state: 'loading' });
      const baseUrl = workerUrl(SESSION_ENDPOINT);
      try {
        const response = await fetch(baseUrl, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const payload = (await response.json()) as SessionResponse;
        if (!cancelled) {
          setSessionState({ state: 'success', data: payload });
        }
      } catch (error) {
        if (!cancelled) {
          setSessionState({ state: 'error', error: (error as Error).message });
        }
      }
    }

    loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchAssets = useCallback(async () => {
    if (!WORKER_ORIGIN) {
      setAssetsState({ state: 'error', error: 'Worker origin not configured.' });
      return;
    }
    setAssetsState({ state: 'loading' });
    try {
      const response = await fetch(workerUrl(ASSET_LIST_ENDPOINT), {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Asset list failed (${response.status})`);
      }
      const payload = (await response.json()) as {
        objects?: AssetObject[];
      };
      setAssetsState({ state: 'success', data: payload.objects ?? [] });
    } catch (error) {
      setAssetsState({ state: 'error', error: (error as Error).message });
    }
  }, []);

  useEffect(() => {
    if (sessionState.state === 'success' && sessionState.data.authenticated) {
      void fetchAssets();
    }
  }, [sessionState, fetchAssets]);

  const handleFileChange = useCallback((event: any) => {
    if (Platform.OS !== 'web') return;
    const file: File | undefined = event?.target?.files?.[0];
    setSelectedFile(file ?? null);
  }, []);

  const handleUpload = useCallback(async () => {
    if (Platform.OS !== 'web') {
      return;
    }
    if (!selectedFile) {
      setUploadStatus({ state: 'error', error: 'Select a file first.' });
      setUploadError('Select a file first.');
      return;
    }
    setUploadStatus({ state: 'loading' });
    setUploadError(null);
    try {
      const key = `uploads/${selectedFile.name}`;
      const response = await fetch(workerUrl(`/api/assets/put?key=${encodeURIComponent(key)}`), {
        method: 'PUT',
        credentials: 'include',
        headers: selectedFile.type ? { 'Content-Type': selectedFile.type } : undefined,
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
  }, [fetchAssets, selectedFile]);

  const body = (() => {
    switch (sessionState.state) {
      case 'idle':
      case 'loading':
        return (
          <View style={{ alignItems: 'center', gap: 12 }}>
            <ActivityIndicator color="#38bdf8" />
            <Text style={{ color: '#cbd5f5' }}>Checking your session…</Text>
          </View>
        );
      case 'error':
        return (
          <View style={{ gap: 12 }}>
            <Text style={{ color: '#f87171', fontWeight: '600' }}>Unable to reach the Worker.</Text>
            <Text style={{ color: '#cbd5f5', lineHeight: 20 }}>{sessionState.error}</Text>
            <WorkerLink path="/login" label="Try signing in again" />
          </View>
        );
      case 'success':
        if (!sessionState.data.authenticated) {
          return (
            <View style={{ gap: 12 }}>
              <Text style={{ color: '#facc15', fontWeight: '600' }}>No active session found.</Text>
              <Text style={{ color: '#cbd5f5' }}>
                Sessions are stored in Workers KV and mirrored to D1. Sign in again to create a fresh session.
              </Text>
              <WorkerLink path="/login" label="Go to login" />
            </View>
          );
        }

        const { session } = sessionState.data;
        return (
          <View style={{ gap: 20 }}>
            <View style={{ gap: 8 }}>
              <Text style={{ color: '#e2e8f0', fontSize: 26, fontWeight: '700' }}>Welcome back</Text>
              <Text style={{ color: '#94a3b8' }}>
                Your session cookie was issued at{' '}
                <Text style={{ fontWeight: '600', color: '#e2e8f0' }}>
                  {new Date(session?.created_at ?? Date.now()).toUTCString()}
                </Text>
                .
              </Text>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
              <PlaceholderCard
                title="Session details"
                description={`Session ID: ${session?.id ?? 'unknown'}`}
              />
              <PlaceholderCard
                title="Next steps"
                description="Wire this screen to your product dashboard, hydrate data from D1, and gate modules by subscription."
              />
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              <WorkerLink path="/payments" label="View Stripe preview" />
              <WorkerLink path="/logout" label="Log out" variant="secondary" />
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
                  Files under <Text style={{ fontWeight: '600' }}>uploads/</Text> are session-gated. Uploads only
                  work in the web preview.
                </Text>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                <Button title="Refresh" onPress={fetchAssets} disabled={assetsState.state === 'loading'} />
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
                        {(object.size / 1024).toFixed(1)} kB •{' '}
                        {object.uploaded ? new Date(object.uploaded).toUTCString() : 'unknown timestamp'}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {Platform.OS === 'web' ? (
                <View style={{ gap: 12 }}>
                  <input type="file" onChange={handleFileChange} accept="*" />
                  <Button
                    title={uploadStatus.state === 'loading' ? 'Uploading…' : 'Upload to uploads/'}
                    onPress={handleUpload}
                    disabled={!selectedFile || uploadStatus.state === 'loading'}
                  />
                  {uploadError ? <Text style={{ color: '#f87171' }}>{uploadError}</Text> : null}
                  {uploadStatus.state === 'success' ? (
                    <Text style={{ color: '#4ade80' }}>Upload complete.</Text>
                  ) : null}
                </View>
              ) : (
                <Text style={{ color: '#94a3b8' }}>
                  Uploads are available on the web preview. Use the Worker API directly on native devices.
                </Text>
              )}
            </View>
          </View>
        );
      default:
        return null;
    }
  })();

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
        }}
      >
        {body}
      </View>
    </ScrollView>
  );
}
