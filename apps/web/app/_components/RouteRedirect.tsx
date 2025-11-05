import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Platform, Pressable, Text } from 'react-native';
import { Link } from 'expo-router';
import * as Linking from 'expo-linking';

type PublicRuntimeEnv = Partial<{
  workerOrigin: string;
  logtoEndpoint: string;
  logtoAppId: string;
  apiResource: string;
  logtoPostLogoutRedirectUri: string;
}>;

type GlobalWithRuntime = typeof globalThis & {
  __JUSTEVERY_ENV__?: PublicRuntimeEnv;
};

type RuntimeSnapshot = {
  workerOrigin: string;
  logtoEndpoint: string;
  logtoAppId: string;
  apiResource: string;
  logtoPostLogoutRedirectUri: string;
};

const runtimeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

function currentInjectedEnv(): PublicRuntimeEnv {
  try {
    return ((globalThis as GlobalWithRuntime).__JUSTEVERY_ENV__ ?? {}) satisfies PublicRuntimeEnv;
  } catch {
    return {};
  }
}

function pickEnv(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return '';
}

const listeners = new Set<Dispatch<SetStateAction<RuntimeSnapshot>>>();

export let WORKER_ORIGIN = '';
export let LOGTO_ENDPOINT = '';
export let LOGTO_APP_ID = '';
export let LOGTO_API_RESOURCE = '';
export let LOGTO_POST_LOGOUT_REDIRECT_URI = '';

let SNAPSHOT: RuntimeSnapshot = {
  workerOrigin: '',
  logtoEndpoint: '',
  logtoAppId: '',
  apiResource: '',
  logtoPostLogoutRedirectUri: '',
};

function updateSnapshot(next: RuntimeSnapshot) {
  const changed =
    SNAPSHOT.apiResource !== next.apiResource ||
    SNAPSHOT.logtoAppId !== next.logtoAppId ||
    SNAPSHOT.logtoEndpoint !== next.logtoEndpoint ||
    SNAPSHOT.workerOrigin !== next.workerOrigin ||
    SNAPSHOT.logtoPostLogoutRedirectUri !== next.logtoPostLogoutRedirectUri;

  SNAPSHOT = next;

  if (!changed) {
    return;
  }

  listeners.forEach((listener) => listener(next));
}

function applyRuntimeEnv(detail?: PublicRuntimeEnv) {
  const injected = detail ?? currentInjectedEnv();
  const resolved: RuntimeSnapshot = {
    workerOrigin: pickEnv(runtimeEnv?.EXPO_PUBLIC_WORKER_ORIGIN, injected.workerOrigin),
    logtoEndpoint: pickEnv(runtimeEnv?.EXPO_PUBLIC_LOGTO_ENDPOINT, injected.logtoEndpoint),
    logtoAppId: pickEnv(runtimeEnv?.EXPO_PUBLIC_LOGTO_APP_ID, injected.logtoAppId),
    apiResource: pickEnv(runtimeEnv?.EXPO_PUBLIC_API_RESOURCE, injected.apiResource),
    logtoPostLogoutRedirectUri: pickEnv(
      runtimeEnv?.EXPO_PUBLIC_LOGTO_POST_LOGOUT_REDIRECT_URI,
      injected.logtoPostLogoutRedirectUri,
    ),
  };

  WORKER_ORIGIN = resolved.workerOrigin;
  LOGTO_ENDPOINT = resolved.logtoEndpoint;
  LOGTO_APP_ID = resolved.logtoAppId;
  LOGTO_API_RESOURCE = resolved.apiResource;
  LOGTO_POST_LOGOUT_REDIRECT_URI = resolved.logtoPostLogoutRedirectUri;

  updateSnapshot(resolved);
}

applyRuntimeEnv();

const RUNTIME_EVENT = 'justevery:env-ready';

if (typeof window !== 'undefined') {
  const withRuntime = window as unknown as GlobalWithRuntime;
  if (withRuntime.__JUSTEVERY_ENV__) {
    applyRuntimeEnv(withRuntime.__JUSTEVERY_ENV__);
  }
  window.addEventListener(RUNTIME_EVENT, (event) => {
    const detail = event instanceof CustomEvent ? (event.detail as PublicRuntimeEnv | undefined) : undefined;
    applyRuntimeEnv(detail);
  });
}

export function useRuntimeEnv(): RuntimeSnapshot {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>(SNAPSHOT);

  useEffect(() => {
    listeners.add(setSnapshot);
    return () => {
      listeners.delete(setSnapshot);
    };
  }, []);

  return snapshot;
}

type WorkerLinkProps = {
  path: string;
  label: string;
  variant?: 'primary' | 'secondary';
};

// Routes that rely on Worker-injected runtime config must reload from the Worker.
const WORKER_REDIRECT_PATHS = new Set(['/login', '/callback', '/logout']);

export function workerUrl(path: string) {
  if (!path.startsWith('/')) {
    return path;
  }
  return SNAPSHOT.workerOrigin ? `${SNAPSHOT.workerOrigin}${path}` : path;
}

export function WorkerLink({ path, label, variant = 'primary' }: WorkerLinkProps) {
  const runtime = useRuntimeEnv();

  const target = useMemo(() => workerUrl(path), [path, runtime.workerOrigin]);
  const shouldForceWorkerNavigation =
    typeof path === 'string' && path.startsWith('/') && runtime.workerOrigin && WORKER_REDIRECT_PATHS.has(path.split('?')[0]);

  const handlePress = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = target;
      return;
    }
    Linking.openURL(target);
  }, [target]);

  const sharedStyles = {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    fontWeight: '600' as const,
    textDecorationLine: 'none' as const,
    textAlign: 'center' as const,
    minWidth: 160,
  };

  if (Platform.OS === 'web') {
    const isExternal = /^https?:\/\//i.test(target);
    if (isExternal || shouldForceWorkerNavigation) {
      return (
        <a
          href={target}
          style={{
            ...sharedStyles,
            color: variant === 'primary' ? '#0f172a' : '#e2e8f0',
            backgroundColor: variant === 'primary' ? '#38bdf8' : 'transparent',
            borderWidth: variant === 'secondary' ? 1 : 0,
            borderColor: '#38bdf8',
          }}
        >
          {label}
        </a>
      );
    }
    return (
      <Link
        href={target}
        style={{
          ...sharedStyles,
          color: variant === 'primary' ? '#0f172a' : '#e2e8f0',
          backgroundColor: variant === 'primary' ? '#38bdf8' : 'transparent',
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: '#38bdf8',
        }}
      >
        {label}
      </Link>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      style={{
        paddingHorizontal: sharedStyles.paddingHorizontal,
        paddingVertical: sharedStyles.paddingVertical,
        borderRadius: sharedStyles.borderRadius,
        backgroundColor: variant === 'primary' ? '#38bdf8' : 'transparent',
        borderWidth: variant === 'secondary' ? 1 : 0,
        borderColor: '#38bdf8',
      }}
    >
      <Text
        style={{
          color: variant === 'primary' ? '#0f172a' : '#e2e8f0',
          fontWeight: sharedStyles.fontWeight,
          textAlign: sharedStyles.textAlign,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
