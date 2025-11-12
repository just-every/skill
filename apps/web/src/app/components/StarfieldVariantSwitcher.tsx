import React from 'react';
import type { ViewStyle } from 'react-native';
import { Pressable, Text, View } from 'react-native';

import { cn } from '../../lib/cn';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import {
  STARFIELD_VARIANT_KEYS,
  STARFIELD_VARIANTS,
  StarfieldVariant,
} from './Starfield';

type StarfieldVariantSwitcherProps = {
  readonly current: StarfieldVariant;
  readonly onChange: (next: StarfieldVariant) => void;
  readonly className?: string;
};

export const StarfieldVariantSwitcher = ({ current, onChange, className }: StarfieldVariantSwitcherProps) => {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
      <View
        testID="starfield-switcher"
        className={cn('pointer-events-auto absolute left-4 bottom-4 z-30 flex flex-col gap-1', className)}
        accessibilityRole="radiogroup"
        accessibilityLabel="Starfield background variants"
      >
      <View className="flex flex-row items-center gap-2">
        <Text className="text-[10px] uppercase tracking-[0.4em] text-slate-400">Depth</Text>
        {prefersReducedMotion ? (
          <Text className="text-[10px] text-slate-500">(motion reduced)</Text>
        ) : null}
      </View>
      <View className="flex flex-row gap-2">
        {STARFIELD_VARIANT_KEYS.map((variant) => {
          const meta = STARFIELD_VARIANTS[variant];
          const isActive = variant === current;
          const gradientStyle: ViewStyle & {
            backgroundImage?: string;
            backgroundSize?: string;
            backgroundPosition?: string;
          } = {
            backgroundImage: meta.swatch,
            backgroundSize: '160% 160%',
            backgroundPosition: '50% 50%',
          };
          return (
            <Pressable
              key={variant}
              testID={`starfield-variant-${variant}`}
              onPress={() => onChange(variant)}
              accessibilityRole="radio"
              accessibilityLabel={meta.label}
              accessibilityState={{ selected: isActive }}
              className={cn(
                'h-9 w-9 rounded-full border border-white/40 bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus-visible:ring-white transition',
                isActive ? 'border-white bg-white/20 shadow-inner' : 'hover:border-white hover:bg-white/20'
              )}
            >
              <View className="h-5 w-5 rounded-full border border-white/30 overflow-hidden">
                <View
                  className="h-full w-full"
                  style={gradientStyle}
                />
              </View>
              <Text className="sr-only">{meta.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};
