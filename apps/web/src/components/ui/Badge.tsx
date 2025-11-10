import React from 'react';
import { Text, TextProps, View } from 'react-native';

import { cn } from '../../lib/cn';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'muted';

export type BadgeProps = TextProps & {
  variant?: BadgeVariant;
};

const badgeVariants: Record<BadgeVariant, string> = {
  default: 'bg-brand-50 text-brand-700 border-brand-100',
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-rose-50 text-rose-800 border-rose-200',
  muted: 'bg-slate-100 text-slate-600 border-slate-200',
};

export const Badge = ({ variant = 'default', className, children, ...props }: BadgeProps) => (
  <View
    className={cn('rounded-full border px-3 py-1', badgeVariants[variant])}
  >
    <Text className={cn('text-xs font-semibold uppercase tracking-wide', className)} {...props}>
      {children}
    </Text>
  </View>
);
