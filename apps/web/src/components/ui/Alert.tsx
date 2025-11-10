import React from 'react';
import { Text, View, ViewProps } from 'react-native';

import { cn } from '../../lib/cn';

type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

export type AlertProps = ViewProps & {
  title?: string;
  description?: string;
  variant?: AlertVariant;
};

const variantClasses: Record<AlertVariant, string> = {
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  danger: 'border-rose-200 bg-rose-50 text-rose-900',
};

export const Alert = ({ title, description, variant = 'info', className, children, ...props }: AlertProps) => (
  <View
    className={cn('rounded-2xl border px-4 py-3', variantClasses[variant], className)}
    {...props}
  >
    {title ? <Text className="text-base font-semibold text-inherit">{title}</Text> : null}
    {description ? <Text className="text-sm text-inherit/80">{description}</Text> : null}
    {children}
  </View>
);
