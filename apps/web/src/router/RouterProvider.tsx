import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';

type RouterContextValue = {
  path: string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
};

const RouterContext = createContext<RouterContextValue | undefined>(undefined);

const initialPath = () => {
  if (typeof window === 'undefined') {
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
    if (typeof window === 'undefined') {
      return;
    }

    const handlePopState = () => {
      setPath(window.location.pathname + window.location.search + window.location.hash);
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const navigate = useCallback((target: string, options?: { replace?: boolean }) => {
    const next = normalisePath(target);

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

