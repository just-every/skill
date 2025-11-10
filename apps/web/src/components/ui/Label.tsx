import React from 'react';
import { Text, TextProps } from 'react-native';

import { cn } from '../../lib/cn';

export type LabelProps = TextProps & {
  required?: boolean;
};

export const Label = ({ className, required, children, ...props }: LabelProps) => (
  <Text className={cn('text-sm font-semibold text-slate-600', className)} {...props}>
    {children}
    {required ? <Text className="text-danger"> *</Text> : null}
  </Text>
);
