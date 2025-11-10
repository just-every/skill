import React from 'react';
import { Image, ImageProps, Text, ViewStyle } from 'react-native';

const SIZE_VARIANTS: Record<number, ViewStyle> = {
  16: { width: 16, height: 16 },
  20: { width: 20, height: 20 },
  24: { width: 24, height: 24 },
  28: { width: 28, height: 28 },
  32: { width: 32, height: 32 },
  40: { width: 40, height: 40 },
  48: { width: 48, height: 48 },
  64: { width: 64, height: 64 },
};

export type LogoProps = ImageProps & {
  size?: number;
};

export const Logo = ({ size = 28, ...props }: LogoProps) => {
  const variant = SIZE_VARIANTS[size];
  const textSize = Math.round(size * 0.7);

  if (typeof window === 'undefined') {
    return (
      <Text style={{ fontSize: textSize, fontWeight: '700' }} accessibilityRole="text">
        je
      </Text>
    );
  }

  const source = require('../../assets/justevery-logo-black.png');

  return (
    <Image
      source={source}
      accessibilityLabel="justevery logo"
      style={variant ?? { width: size, height: size }}
      {...props}
    />
  );
};
