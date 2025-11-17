import React from 'react';
import { Platform } from 'react-native';

import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { usePrefersDataSaver } from '../../lib/usePrefersDataSaver';
import { usePrefersCoarsePointer } from '../../lib/usePrefersCoarsePointer';
import ReactBitsPixelBlast, { type PixelBlastProps } from './ReactBitsPixelBlast';

type PixelBlastBackdropProps = PixelBlastProps;

const PixelBlastBackdrop: React.FC<PixelBlastBackdropProps> = ({
  className,
  style,
  color = '#007bff',
  variant = 'square',
  pixelSize = 4,
  patternScale = 2,
  patternDensity = 1,
  pixelSizeJitter = 0,
  rippleSpeed = 0.4,
  rippleThickness = 0.12,
  rippleIntensityScale = 1.5,
  liquid = false,
  liquidStrength = 0.12,
  liquidRadius = 1.2,
  liquidWobbleSpeed = 5,
  enableRipples = true,
  speed = 0.5,
  edgeFade = 0.25,
  transparent = true,
  ...rest
}) => {
  const prefersReducedMotion = usePrefersReducedMotion();
  const prefersDataSaver = usePrefersDataSaver();
  const prefersCoarsePointer = usePrefersCoarsePointer();

  if (Platform.OS !== 'web') {
    return null;
  }

  const interactiveDisabled = prefersReducedMotion || prefersDataSaver;
  const resolvedSpeed = prefersCoarsePointer ? speed * 0.7 : speed;
  const resolvedRipples = enableRipples && !prefersCoarsePointer && !interactiveDisabled;

  if (interactiveDisabled) {
    return (
      <div
        className={className}
        style={{
          pointerEvents: 'none',
          background:
            'radial-gradient(circle at 20% 20%, rgba(56,189,248,0.25), transparent 60%), linear-gradient(165deg, rgba(15,23,42,0.95), rgba(15,23,42,0.35))',
          ...(style ?? {}),
        }}
        aria-hidden
      />
    );
  }

  return (
    <ReactBitsPixelBlast
      className={className}
      style={{ pointerEvents: 'none', ...(style ?? {}) }}
      fillMode="absolute"
      color={color}
      variant={variant}
      pixelSize={pixelSize}
      patternScale={patternScale}
      patternDensity={patternDensity}
      pixelSizeJitter={pixelSizeJitter}
      rippleSpeed={rippleSpeed}
      rippleThickness={rippleThickness}
      rippleIntensityScale={rippleIntensityScale}
      enableRipples={resolvedRipples}
      liquid={liquid}
      liquidStrength={liquidStrength}
      liquidRadius={liquidRadius}
      liquidWobbleSpeed={liquidWobbleSpeed}
      speed={resolvedSpeed}
      edgeFade={edgeFade}
      transparent={transparent}
      {...rest}
    />
  );
};

export default PixelBlastBackdrop;
