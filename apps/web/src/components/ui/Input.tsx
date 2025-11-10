import React, { forwardRef } from 'react';
import { Text, TextInput, TextInputProps, View } from 'react-native';

import { cn } from '../../lib/cn';

export type InputProps = TextInputProps & {
  errorText?: string;
  containerClassName?: string;
};

export const Input = forwardRef<TextInput, InputProps>(
  ({ className, containerClassName, errorText, editable = true, ...props }, ref) => (
    <View className={cn('gap-2', containerClassName)}>
      <TextInput
        ref={ref}
        editable={editable}
        className={cn(
          'rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-ink',
          'focus:border-brand-500 focus:bg-white focus:outline-none',
          !editable && 'bg-slate-100 text-slate-400',
          errorText && 'border-danger text-danger',
          className,
        )}
        placeholderTextColor="#94a3b8"
        {...props}
      />
      {errorText ? <Text className="text-sm text-danger">{errorText}</Text> : null}
    </View>
  )
);

Input.displayName = 'Input';
