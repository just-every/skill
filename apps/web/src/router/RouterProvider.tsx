import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type RouterContextValue = {
  path: string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
};

const RouterContext = createContext<RouterContextValue | undefined>(undefined);

function normalizePath(raw: string): string {
  if (!raw) return '/';
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const parsed = new URL(raw);
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return '/';
    }
  }
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function getInitialPath(): string {
  if (typeof window === 'undefined' || !window.location) return '/';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export interface RouterProviderProps {
  readonly initialPath?: string;
  readonly children?: React.ReactNode;
}

export const RouterProvider = ({ initialPath, children }: RouterProviderProps) => {
  const [path, setPath] = useState<string>(() => initialPath ?? getInitialPath());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPop = () => setPath(getInitialPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    const next = normalizePath(to);
    if (typeof window === 'undefined') {
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

  const value = useMemo(() => ({ path, navigate }), [path, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
};

export const useRouterContext = (): RouterContextValue => {
  const value = useContext(RouterContext);
  if (!value) {
    throw new Error('useRouterContext must be used within RouterProvider');
  }
  return value;
};
