import { LogtoConfig, LogtoProvider, UserScope, useLogto } from '@logto/rn';
import React, { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { type ClientEnv, usePublicEnv } from './src/runtimeEnv';

type Nullable<T> = T | null;

type ReadyConfigState = {
  kind: 'ready';
  config: LogtoConfig;
  redirectUri: string;
  logoutRedirectUri?: string;
  workerOrigin?: string;
  apiResource?: string;
};

type ConfigState = ReadyConfigState | { kind: 'error'; reasons: string[] };

type UserInfo = {
  sub?: string;
  name?: string;
  email?: string;
  [key: string]: unknown;
};

const DEFAULT_REDIRECT = 'justevery://callback';

function buildConfig(env: ClientEnv): ConfigState {
  const issues: string[] = [];

  if (!env.logtoEndpoint) {
    issues.push('Missing EXPO_PUBLIC_LOGTO_ENDPOINT.');
  }

  if (!env.logtoAppId) {
    issues.push('Missing EXPO_PUBLIC_LOGTO_APP_ID.');
  }

  if (issues.length > 0) {
    return { kind: 'error', reasons: issues };
  }

  const scopes = env.scopes.length > 0 ? env.scopes : [UserScope.Email];
  const resources = env.resources.length > 0 ? env.resources : undefined;

  const config: LogtoConfig = {
    endpoint: env.logtoEndpoint!,
    appId: env.logtoAppId!,
    scopes,
    resources,
  };

  return {
    kind: 'ready',
    config,
    redirectUri: env.redirectUri ?? DEFAULT_REDIRECT,
    logoutRedirectUri: env.postLogoutRedirectUri,
    workerOrigin: env.workerOrigin,
    apiResource: env.apiResource,
  };
}

type PlaceholderProps = {
  redirectUri: string;
  logoutRedirectUri?: string;
  workerOrigin?: string;
  apiResource?: string;
};

const PlaceholderContent = ({
  redirectUri,
  logoutRedirectUri,
  workerOrigin,
  apiResource,
}: PlaceholderProps) => {
  const { signIn, signOut, isAuthenticated, fetchUserInfo, isInitialized } = useLogto();
  const [user, setUser] = useState<Nullable<UserInfo>>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [authError, setAuthError] = useState<Nullable<string>>(null);
  const [workerError, setWorkerError] = useState<Nullable<string>>(null);
  const [workerPreview, setWorkerPreview] = useState<string | null>(null);
  const [workerLoading, setWorkerLoading] = useState(false);

  const workerProductsEndpoint = useMemo(() => {
    if (!workerOrigin) {
      return null;
    }
    return joinWorkerPath(workerOrigin, '/api/stripe/products');
  }, [workerOrigin]);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      try {
        setAuthError(null);
        setProfileLoading(true);
        const info = await fetchUserInfo();
        if (mounted) {
          setUser(info as UserInfo);
        }
      } catch (err) {
        if (mounted) {
          setAuthError(err instanceof Error ? err.message : 'Failed to load profile');
        }
      } finally {
        if (mounted) {
          setProfileLoading(false);
        }
      }
    };

    if (isAuthenticated) {
      void loadProfile();
    } else {
      setUser(null);
    }

    return () => {
      mounted = false;
    };
  }, [fetchUserInfo, isAuthenticated]);

  useEffect(() => {
    setWorkerPreview(null);
    setWorkerError(null);
    setWorkerLoading(false);
  }, [workerProductsEndpoint]);

  const handleSignIn = useCallback(async () => {
    setAuthError(null);
    try {
      await signIn(redirectUri);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to start sign-in');
    }
  }, [redirectUri, signIn]);

  const handleSignOut = useCallback(async () => {
    setAuthError(null);
    try {
      await signOut(logoutRedirectUri);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to sign out');
    }
  }, [logoutRedirectUri, signOut]);

  const handleOpenWorker = useCallback(() => {
    if (!workerOrigin) {
      setWorkerError('Configure EXPO_PUBLIC_WORKER_ORIGIN to open the deployed Worker shell.');
      return;
    }
    const target = joinWorkerPath(workerOrigin, '/app');
    if (Platform.OS === 'web') {
      window.open(target, '_blank', 'noopener,noreferrer');
      return;
    }
    Linking.openURL(target).catch((err: unknown) => {
      setWorkerError(err instanceof Error ? err.message : 'Unable to open Worker URL');
    });
  }, [workerOrigin]);

  const handleFetchWorkerProducts = useCallback(async () => {
    if (!workerProductsEndpoint) {
      setWorkerError('Configure EXPO_PUBLIC_WORKER_ORIGIN (or run bootstrap.sh) to contact the Worker API.');
      return;
    }

    setWorkerError(null);
    setWorkerLoading(true);
    try {
      const response = await fetch(workerProductsEndpoint, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Worker responded with ${response.status}`);
      }
      const payload = await response.json();
      setWorkerPreview(JSON.stringify(payload, null, 2));
    } catch (err) {
      setWorkerPreview(null);
      setWorkerError(err instanceof Error ? err.message : 'Failed to fetch from Worker.');
    } finally {
      setWorkerLoading(false);
    }
  }, [workerProductsEndpoint]);

  const showAuthLoading = !isInitialized || profileLoading;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.heading}>Justevery Starter Shell</Text>
          <Text style={styles.subheading}>
            Bootstrap Logto authentication and Cloudflare Worker integration before you build product features.
          </Text>
        </View>

        {showAuthLoading && <ActivityIndicator size="small" color="#2563eb" style={styles.spinner} />}
        {authError && <Text style={styles.error}>{authError}</Text>}

        <View style={styles.section}>
          <Text style={styles.label}>Authentication</Text>
          <Text style={styles.muted}>Use your Logto tenant credentials to sign in and inspect ID token fields.</Text>
          <View style={styles.card}>
            <Text style={styles.field}>
              <Text style={styles.fieldLabel}>Redirect URI:</Text> {redirectUri}
            </Text>
            <Text style={styles.field}>
              <Text style={styles.fieldLabel}>Post-logout redirect:</Text>{' '}
              {logoutRedirectUri ?? 'Configure EXPO_PUBLIC_LOGTO_POST_LOGOUT_REDIRECT_URI'}
            </Text>
            {isAuthenticated ? (
              <View style={styles.cardBody}>
                <Text style={styles.field}>
                  <Text style={styles.fieldLabel}>Subject:</Text> {user?.sub ?? '—'}
                </Text>
                <Text style={styles.field}>
                  <Text style={styles.fieldLabel}>Name:</Text> {user?.name ?? '—'}
                </Text>
                <Text style={styles.field}>
                  <Text style={styles.fieldLabel}>Email:</Text> {user?.email ?? '—'}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.actionsRow}>
            {isAuthenticated ? (
              <ActionButton title="Sign out" onPress={handleSignOut} variant="secondary" disabled={showAuthLoading} />
            ) : (
              <ActionButton title="Sign in" onPress={handleSignIn} disabled={showAuthLoading} />
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Cloudflare Worker</Text>
          <Text style={styles.muted}>
            bootstrap.sh provisions a Worker and injects public runtime env so the Expo shell can link to deployed routes.
          </Text>
          <View style={styles.card}>
            <Text style={styles.field}>
              <Text style={styles.fieldLabel}>Worker origin:</Text>{' '}
              {workerOrigin ?? 'Not configured (set EXPO_PUBLIC_WORKER_ORIGIN)'}
            </Text>
            <Text style={styles.field}>
              <Text style={styles.fieldLabel}>API resource:</Text> {apiResource ?? '—'}
            </Text>
          </View>
          <View style={styles.actionsRow}>
            <ActionButton
              title="Open Worker Shell"
              onPress={handleOpenWorker}
              variant="secondary"
              disabled={!workerOrigin}
            />
            <ActionButton
              title={workerLoading ? 'Fetching…' : 'Fetch Stripe products'}
              onPress={handleFetchWorkerProducts}
              disabled={!workerProductsEndpoint || workerLoading}
            />
          </View>
          {workerError && <Text style={styles.error}>{workerError}</Text>}
          {workerPreview && (
            <View style={styles.codePanel}>
              <Text style={styles.codeHeading}>/api/stripe/products</Text>
              <Text style={styles.codeBlock}>{workerPreview}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const ConfigError = ({ reasons }: { reasons: string[] }) => (
  <SafeAreaView style={styles.safeArea}>
    <View style={styles.container}>
      <Text style={styles.heading}>Configuration required</Text>
      <Text style={styles.subheading}>Update your Expo env vars to finish Logto setup.</Text>
      {reasons.map((reason) => (
        <Text key={reason} style={styles.error}>
          {reason}
        </Text>
      ))}
    </View>
  </SafeAreaView>
);

const App = (): ReactNode => {
  const env = usePublicEnv();
  const configState = useMemo(() => buildConfig(env), [env]);

  if (configState.kind === 'error') {
    return <ConfigError reasons={configState.reasons} />;
  }

  const { config, redirectUri, logoutRedirectUri, workerOrigin, apiResource } = configState;

  return (
    <LogtoProvider config={config}>
      <PlaceholderContent
        redirectUri={redirectUri}
        logoutRedirectUri={logoutRedirectUri}
        workerOrigin={workerOrigin}
        apiResource={apiResource}
      />
    </LogtoProvider>
  );
};

type ActionButtonProps = {
  title: string;
  onPress: () => void | Promise<void>;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
};

const ActionButton = ({ title, onPress, variant = 'primary', disabled }: ActionButtonProps) => {
  const handlePress = useCallback(() => {
    if (disabled) {
      return;
    }
    void onPress();
  }, [disabled, onPress]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={[
        styles.actionButton,
        variant === 'primary' ? styles.actionPrimary : styles.actionSecondary,
        disabled ? styles.actionDisabled : null,
      ]}
      accessibilityRole="button"
    >
      <Text
        style={[
          styles.actionLabel,
          variant === 'primary' ? styles.actionLabelPrimary : styles.actionLabelSecondary,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
};

function joinWorkerPath(origin: string, path: string): string {
  const base = origin.replace(/\/+$/, '');
  if (!path) {
    return base;
  }
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    flexGrow: 1,
    padding: 24,
    gap: 24,
  },
  hero: {
    gap: 12,
    alignItems: 'flex-start',
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: '#0f172a',
  },
  subheading: {
    fontSize: 16,
    color: '#475569',
    lineHeight: 22,
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    gap: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  label: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1e293b',
  },
  muted: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardBody: {
    gap: 6,
  },
  field: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
  },
  fieldLabel: {
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 12,
  },
  actionButton: {
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  actionPrimary: {
    backgroundColor: '#2563eb',
  },
  actionSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  actionDisabled: {
    opacity: 0.5,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  actionLabelPrimary: {
    color: '#ffffff',
  },
  actionLabelSecondary: {
    color: '#1d4ed8',
  },
  spinner: {
    alignSelf: 'center',
  },
  error: {
    color: '#dc2626',
    textAlign: 'left',
  },
  codePanel: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  codeHeading: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  codeBlock: {
    color: '#e2e8f0',
    fontSize: 12,
    lineHeight: 16,
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'Menlo,Consolas,monospace',
    }),
  },
});

export default App;
