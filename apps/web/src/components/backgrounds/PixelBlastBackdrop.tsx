import React from 'react';
import { Platform } from 'react-native';

import ReactBitsPixelBlast, { type PixelBlastProps } from './ReactBitsPixelBlast';

type PixelBlastBackdropProps = PixelBlastProps;

const PixelBlastBackdrop: React.FC<PixelBlastBackdropProps> = ({
  className,
  style,
  color = '#B19EEF',
  variant = 'circle',
  pixelSize = 6,
  patternScale = 3,
  patternDensity = 1.2,
  pixelSizeJitter = 0.5,
  rippleSpeed = 0.4,
  rippleThickness = 0.12,
  rippleIntensityScale = 1.5,
  liquid = true,
  liquidStrength = 0.12,
  liquidRadius = 1.2,
  liquidWobbleSpeed = 5,
  enableRipples = true,
  speed = 0.6,
  edgeFade = 0.25,
  transparent = true,
  ...rest
}) => {
  if (Platform.OS !== 'web') {
    return null;
  }

  return (
    <ReactBitsPixelBlast
      className={className}
      style={{ pointerEvents: 'none', ...(style ?? {}) }}
      color={color}
      variant={variant}
      pixelSize={pixelSize}
      patternScale={patternScale}
      patternDensity={patternDensity}
      pixelSizeJitter={pixelSizeJitter}
      rippleSpeed={rippleSpeed}
      rippleThickness={rippleThickness}
      rippleIntensityScale={rippleIntensityScale}
      enableRipples={enableRipples}
      liquid={liquid}
      liquidStrength={liquidStrength}
      liquidRadius={liquidRadius}
      liquidWobbleSpeed={liquidWobbleSpeed}
      speed={speed}
      edgeFade={edgeFade}
      transparent={transparent}
      {...rest}
    />
  );
};

export default PixelBlastBackdrop;
