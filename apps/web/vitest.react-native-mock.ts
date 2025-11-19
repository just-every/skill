import React from 'react';
import type { JSX } from 'react';

const createElement = (tag: keyof JSX.IntrinsicElements) =>
  React.forwardRef<HTMLElement, any>(({ children, ...props }, ref) =>
    React.createElement(tag, { ref, ...props }, children)
  );

const View = createElement('div');
const Text = createElement('span');
const ScrollView = createElement('div');
const ActivityIndicator = createElement('div');

const Pressable = React.forwardRef<HTMLButtonElement, any>(
  ({ children, onPress, ...props }, ref) =>
    React.createElement(
      'button',
      {
        type: 'button',
        ref,
        ...props,
        onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
          onPress?.(event);
        },
      },
      children
    )
);

export { View, Text, ScrollView, ActivityIndicator, Pressable };

export default {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
  Platform: { OS: 'web' },
};
