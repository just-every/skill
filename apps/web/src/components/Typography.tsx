import React, { forwardRef } from 'react';
import { Platform, StyleSheet, Text, TextProps } from 'react-native';

import { cn } from '../lib/cn';

type TypographyVariant = 'h1' | 'h2' | 'h3' | 'eyebrow' | 'body' | 'bodySmall' | 'caption';

const variantClasses: Record<TypographyVariant, string> = {
  h1: 'text-4xl md:text-5xl font-semibold leading-tight tracking-tight font-display text-ink',
  h2: 'text-3xl font-semibold leading-snug font-display text-ink',
  h3: 'text-2xl font-semibold leading-snug font-display text-ink',
  eyebrow: 'text-xs uppercase tracking-[0.4em] leading-none font-semibold font-sans text-slate-500',
  body: 'text-base leading-relaxed font-sans text-slate-600',
  bodySmall: 'text-sm leading-6 font-sans text-slate-500',
  caption: 'text-xs leading-normal font-sans text-slate-500',
};

export type TypographyProps = TextProps & {
  readonly variant?: TypographyVariant;
};

export const Typography = forwardRef<Text, TypographyProps>(({ variant = 'body', className, style, ...props }, ref) => {
  // Normalise incoming className for web usage.
  const safeClassName = Array.isArray(className) ? className.join(' ') : className ?? '';
  const mergedClassName = cn(variantClasses[variant], safeClassName);

  if (__DEV__) {
    console.log('[Typography]', Platform.OS, typeof className, className);
  }

  if (Platform.OS === 'web') {
    return <Text ref={ref} className={mergedClassName} style={style} {...props} />;
  }

  // On native we avoid className entirely to sidestep the RN bridge type error.
  const nativeStyle = StyleSheet.flatten([variantNativeStyles[variant], style]);
  return <Text ref={ref} style={nativeStyle} {...props} />;
});

const variantNativeStyles = StyleSheet.create({
  h1: { fontSize: 36, lineHeight: 44, fontWeight: '600', color: '#0f172a' },
  h2: { fontSize: 30, lineHeight: 36, fontWeight: '600', color: '#0f172a' },
  h3: { fontSize: 24, lineHeight: 30, fontWeight: '600', color: '#0f172a' },
  eyebrow: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 4,
    textTransform: 'uppercase',
    color: '#64748b',
  },
  body: { fontSize: 16, lineHeight: 22, color: '#475569' },
  bodySmall: { fontSize: 14, lineHeight: 20, color: '#475569' },
  caption: { fontSize: 12, lineHeight: 18, color: '#475569' },
});

Typography.displayName = 'Typography';
