import React from 'react';
import { Platform, Text, View } from 'react-native';

export type BrandImageProps = {
  readonly src: string;
  readonly alt: string;
  readonly className?: string;
  readonly width?: number;
  readonly height?: number;
};

export const BrandImage = ({ src, alt, className, width, height }: BrandImageProps) => {
  if (Platform.OS !== 'web') {
    return (
      <View
        accessibilityRole="image"
        accessibilityLabel={alt}
        className={className}
        style={{ width, height, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#ebe7df' }}
      >
        <Text style={{ color: '#7b7569', fontSize: 12 }}>{alt}</Text>
      </View>
    );
  }

  return <img src={src} alt={alt} className={className} width={width} height={height} />;
};

