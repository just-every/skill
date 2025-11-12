import { useEffect, useState } from 'react';

const QUERY = '(pointer: coarse)';

export const usePrefersCoarsePointer = (): boolean => {
  const [prefersCoarsePointer, setPrefersCoarsePointer] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mediaQuery = window.matchMedia(QUERY);
    const handler = (event: MediaQueryListEvent) => {
      setPrefersCoarsePointer(event.matches);
    };
    mediaQuery.addEventListener('change', handler);
    return () => {
      mediaQuery.removeEventListener('change', handler);
    };
  }, []);

  return prefersCoarsePointer;
};
