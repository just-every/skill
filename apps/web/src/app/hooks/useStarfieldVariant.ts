import { useCallback, useEffect, useState } from 'react';

import { DEFAULT_STARFIELD_VARIANT, isStarfieldVariant, type StarfieldVariant } from '../components/Starfield';

const STORAGE_KEY = 'starfield.variant';
const LEGACY_STORAGE_KEY = 'justevery.starfield.variant';

const readStoredVariant = (): StarfieldVariant => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return DEFAULT_STARFIELD_VARIANT;
  }
  const stored = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (stored && isStarfieldVariant(stored)) {
    if (!window.localStorage.getItem(STORAGE_KEY)) {
      window.localStorage.setItem(STORAGE_KEY, stored);
    }
    return stored;
  }
  return DEFAULT_STARFIELD_VARIANT;
};

export const useStarfieldVariant = (): readonly [StarfieldVariant, (next: StarfieldVariant) => void] => {
  const [variant, setVariant] = useState<StarfieldVariant>(() => DEFAULT_STARFIELD_VARIANT);

  useEffect(() => {
    const storedVariant = readStoredVariant();
    setVariant(storedVariant);
  }, []);

  const selectVariant = useCallback((next: StarfieldVariant) => {
    setVariant(next);
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, next);
    window.localStorage.setItem(LEGACY_STORAGE_KEY, next);
  }, []);

  return [variant, selectVariant] as const;
};
