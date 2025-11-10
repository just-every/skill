import React, { forwardRef } from 'react';
import { Text, TextProps } from 'react-native';

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

export const Typography = forwardRef<Text, TypographyProps>(
  ({ variant = 'body', className, ...props }, ref) => (
    <Text ref={ref} className={cn(variantClasses[variant], className)} {...props} />
  ),
);

Typography.displayName = 'Typography';
