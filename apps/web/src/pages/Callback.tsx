import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { useRouterContext } from '../router/RouterProvider';

const Callback = () => {
  const { status, authError } = useAuth();
  const { path, navigate } = useRouterContext();

  const returnPath = useMemo(() => extractReturnPath(path), [path]);

  useEffect(() => {
    if (status === 'authenticated') {
      navigate(returnPath, { replace: true });
    }
  }, [navigate, returnPath, status]);

  return (
    <View className="flex-1 min-h-[320px] items-center justify-center gap-3 bg-surface px-6 py-12">
      <ActivityIndicator color="#38bdf8" />
      <Text className="text-base text-slate-600 text-center">
        {status === 'authenticated'
          ? 'Authenticated. Redirecting…'
          : status === 'error'
            ? 'We could not verify your session.'
            : 'Finishing authentication… You will be redirected momentarily.'}
      </Text>
      {authError ? <Text className="text-xs text-red-500 text-center">{authError}</Text> : null}
    </View>
  );
};

export default Callback;

const extractReturnPath = (fullPath: string): string => {
  try {
    const url = new URL(fullPath, 'https://placeholder.local');
    const raw = url.searchParams.get('return');
    if (raw) {
      const normalised = normalisePathOnly(raw);
      if (normalised) return normalised;
    }
    return '/app/overview';
  } catch {
    return '/app/overview';
  }
};

const normalisePathOnly = (value: string): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value, 'https://placeholder.local');
    const candidate = url.pathname + url.search + url.hash;
    return candidate.startsWith('/') ? candidate : `/${candidate}`;
  } catch {
    return value.startsWith('/') ? value : `/${value}`;
  }
};
