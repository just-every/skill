import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Linking, Platform } from 'react-native';
import * as ExpoLinking from 'expo-linking';

type RouterContextValue = {
  path: string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
};

const RouterContext = createContext<RouterContextValue | undefined>(undefined);

const initialPath = () => {
  if (Platform.OS !== 'web') {
    const candidate = process.env.EXPO_PUBLIC_START_PATH;
    if (typeof candidate === 'string' && candidate.trim()) {
      const trimmed = candidate.trim();
      return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    }
    return '/app/overview';
  }
  if (typeof window === 'undefined' || !window.location) {
    return '/';
  }
  return window.location.pathname + window.location.search + window.location.hash;
};

const normalisePath = (raw: string): string => {
  if (!raw) {
    return '/';
  }

  const candidate = raw.trim();

  if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
    try {
      const parsed = new URL(candidate);
      return parsed.pathname + parsed.search + parsed.hash;
    } catch {
      return '/';
    }
  }

  if (candidate.startsWith('/')) {
    return candidate;
  }

  return `/${candidate}`;
};

export interface RouterProviderProps {
  readonly children?: React.ReactNode;
}

export const RouterProvider = ({ children }: RouterProviderProps) => {
  const [path, setPath] = useState<string>(initialPath);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.location || typeof window.addEventListener !== 'function') {
      return;
    }

    const handlePopState = () => {
      if (!window.location) {
        return;
      }
      setPath(window.location.pathname + window.location.search + window.location.hash);
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    // Native deep links: mirror Linking events into the router state so we can react to auth callbacks.
    if (Platform.OS === 'web') {
      return undefined;
    }
    const updateFromUrl = (url?: string | null) => {
      if (!url) return;
      const parsed = ExpoLinking.parse(url);
      const rawPath = parsed?.path ? `/${parsed.path}` : '/';
      const query = parsed?.queryParams && Object.keys(parsed.queryParams).length > 0
        ? `?${new URLSearchParams(parsed.queryParams as Record<string, string>).toString()}`
        : '';
      setPath(normalisePath(`${rawPath}${query}`));
    };

    Linking.getInitialURL().then(updateFromUrl).catch(() => undefined);

    const subscription = Linking.addEventListener('url', ({ url }) => updateFromUrl(url));
    return () => subscription.remove();
  }, []);

  const navigate = useCallback((target: string, options?: { replace?: boolean }) => {
    const next = normalisePath(target);

    if (typeof window === 'undefined' || !window.location) {
      setPath(next);
      return;
    }

    if (options?.replace) {
      window.history.replaceState(null, '', next);
    } else {
      window.history.pushState(null, '', next);
    }
    setPath(next);
  }, []);

  const value = useMemo<RouterContextValue>(() => ({ path, navigate }), [path, navigate]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
};

export const useRouterContext = (): RouterContextValue => {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRouterContext must be used within a RouterProvider');
  }
  return context;
};
