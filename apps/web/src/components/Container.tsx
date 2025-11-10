import React, { forwardRef } from 'react';
import { View, ViewProps } from 'react-native';

import { cn } from '../lib/cn';

export type ContainerProps = ViewProps & {
  readonly className?: string;
};

export const Container = forwardRef<View, ContainerProps>(
  ({ className, style, ...rest }, ref) => (
    <View
      ref={ref}
      style={style}
      className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8', className)}
      {...rest}
    />
  ),
);

Container.displayName = 'Container';
