import { useCallback } from 'react';
import { Platform, Pressable, Text } from 'react-native';
import { Link } from 'expo-router';
import * as Linking from 'expo-linking';

type PublicRuntimeEnv = Partial<{
  workerOrigin: string;
}>;

const runtimeEnv = (globalThis as {
  process?: { env?: Record<string, string | undefined> };
  __JUSTEVERY_ENV__?: PublicRuntimeEnv;
}).process?.env;

const injectedEnv = (globalThis as { __JUSTEVERY_ENV__?: PublicRuntimeEnv }).__JUSTEVERY_ENV__ ?? {};

export const WORKER_ORIGIN = runtimeEnv?.EXPO_PUBLIC_WORKER_ORIGIN ?? injectedEnv.workerOrigin ?? '';

type WorkerLinkProps = {
  path: string;
  label: string;
  variant?: 'primary' | 'secondary';
};

export function workerUrl(path: string) {
  if (!path.startsWith('/')) {
    return path;
  }
  if (path === '/login' || path.startsWith('/login?')) {
    return path;
  }
  return WORKER_ORIGIN ? `${WORKER_ORIGIN}${path}` : path;
}

export function WorkerLink({ path, label, variant = 'primary' }: WorkerLinkProps) {
  const target = workerUrl(path);

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
