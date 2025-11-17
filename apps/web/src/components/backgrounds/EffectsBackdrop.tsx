import React from 'react';
import { Platform } from 'react-native';

import { usePrefersDataSaver } from '../../lib/usePrefersDataSaver';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { usePrefersCoarsePointer } from '../../lib/usePrefersCoarsePointer';
import EffectManager from './EffectManager';

type EffectsBackdropProps = {
  readonly className?: string;
  readonly style?: React.CSSProperties;
};

const fallbackStyle: React.CSSProperties = {
  pointerEvents: 'none',
  background:
    'radial-gradient(circle at 20% 20%, rgba(56,189,248,0.25), transparent 60%), linear-gradient(165deg, rgba(15,23,42,0.95), rgba(15,23,42,0.35))'
};

const EffectsBackdrop: React.FC<EffectsBackdropProps> = ({ className, style }) => {
  const prefersReducedMotion = usePrefersReducedMotion();
  const prefersDataSaver = usePrefersDataSaver();
  const prefersCoarsePointer = usePrefersCoarsePointer();

  if (Platform.OS !== 'web') {
    return null;
  }

  if (prefersReducedMotion || prefersDataSaver) {
    return (
      <div className={className} style={{ ...fallbackStyle, ...(style ?? {}) }} aria-hidden />
    );
  }

  return (
    <EffectManager
      className={className}
      style={{ pointerEvents: 'none', ...(style ?? {}) }}
      fillMode="absolute"
      enablePointerTracking={!prefersCoarsePointer}
    />
  );
};

export default EffectsBackdrop;
