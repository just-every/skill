import React from 'react';
import { Text, TextProps, View, ViewProps } from 'react-native';

import { cn } from '../../lib/cn';

export type CardProps = ViewProps;

export const Card = ({ className, ...props }: CardProps) => (
  <View
    className={cn('rounded-3xl border border-slate-200 bg-white shadow-card', className)}
    {...props}
  />
);

export const CardHeader = ({ className, ...props }: ViewProps) => (
  <View className={cn('px-6 pt-6', className)} {...props} />
);

export const CardTitle = ({ className, ...props }: TextProps) => (
  <Text className={cn('text-2xl font-bold text-ink', className)} {...props} />
);

export const CardDescription = ({ className, ...props }: TextProps) => (
  <Text className={cn('text-base text-slate-500', className)} {...props} />
);

export const CardContent = ({ className, ...props }: ViewProps) => (
  <View className={cn('px-6 pb-6', className)} {...props} />
);

export const CardFooter = ({ className, ...props }: ViewProps) => (
  <View className={cn('px-6 pb-6 pt-2', className)} {...props} />
);
