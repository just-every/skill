import React, { forwardRef } from 'react';
import { ActivityIndicator, Pressable, PressableProps, Text } from 'react-native';

import { cn } from '../../lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = PressableProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  textClassName?: string;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 active:bg-brand-700',
  secondary: 'bg-ink text-white active:bg-ink/90',
  ghost: 'bg-transparent border border-slate-300 active:bg-slate-100',
};

const textVariants: Record<ButtonVariant, string> = {
  primary: 'text-white',
  secondary: 'text-white',
  ghost: 'text-ink',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-3 text-base',
  lg: 'px-6 py-4 text-lg',
};

export const Button = forwardRef<Pressable, ButtonProps>(
  ({
    children,
    className,
    textClassName,
    variant = 'primary',
    size = 'md',
    loading,
    disabled,
    ...rest
  }, ref) => {
    const isDisabled = disabled || loading;

    return (
      <Pressable
        ref={ref}
        accessibilityRole="button"
        disabled={isDisabled}
        className={cn(
          'rounded-2xl flex-row items-center justify-center gap-2 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-500 focus-visible:ring-offset-white',
          sizeClasses[size],
          variantClasses[variant],
          isDisabled && 'opacity-60',
          className,
        )}
        {...rest}
      >
        {loading ? (
          <ActivityIndicator color={variant === 'ghost' ? '#0f172a' : '#ffffff'} />
        ) : (
          <Text className={cn('font-semibold text-center', textVariants[variant], textClassName)}>{children}</Text>
        )}
      </Pressable>
    );
  }
);

Button.displayName = 'Button';
