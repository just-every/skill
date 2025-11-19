import { defineConfig } from 'vitest/config';
import path from 'node:path';

const reactNativeVirtualId = '\0vitest-react-native-stub';
const reactNativeSvgVirtualId = '\0vitest-react-native-svg-stub';
const fontAwesomeVirtualId = '\0vitest-fontawesome-stub';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
  resolve: {
    alias: [{ find: 'src', replacement: path.resolve(__dirname, 'src') }],
  },
  plugins: [
    {
      name: 'vitest-react-native-stubs',
      enforce: 'pre',
      resolveId(source) {
        if (source === 'react-native' || source.startsWith('react-native/')) {
          return reactNativeVirtualId;
        }
        if (source === 'react-native-svg' || source.startsWith('react-native-svg/')) {
          return reactNativeSvgVirtualId;
        }
        if (source === '@fortawesome/react-native-fontawesome') {
          return fontAwesomeVirtualId;
        }
        return null;
      },
      load(id) {
        if (id === reactNativeVirtualId) {
          return `import React from 'react';
const mapProps = ({ testID, accessibilityRole, accessibilityLabel, accessibilityState, ...rest }) => {
  const mapped = { ...rest };
  if (testID) mapped['data-testid'] = testID;
  if (accessibilityRole) mapped['data-accessibility-role'] = accessibilityRole;
  if (accessibilityLabel) mapped['aria-label'] = accessibilityLabel;
  if (accessibilityState) {
    Object.entries(accessibilityState).forEach(([key, value]) => {
      const attr =
        key === 'selected'
          ? 'aria-selected'
          : key === 'disabled'
            ? 'aria-disabled'
            : key === 'busy'
              ? 'aria-busy'
              : 'data-' + key;
      mapped[attr] = value;
    });
  }
  return mapped;
};
const create = (tag) =>
  React.forwardRef(({ children, ...props }, ref) => React.createElement(tag, { ref, ...mapProps(props) }, children));
const View = create('div');
const Text = create('span');
const ScrollView = create('div');
const ActivityIndicator = create('div');
const Pressable = React.forwardRef(({ children, onPress, ...props }, ref) =>
  React.createElement(
    'button',
    {
      type: 'button',
      ref,
      ...mapProps(props),
      onClick: (event) => onPress?.(event),
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
  StyleSheet: { create: (styles) => styles },
  Platform: { OS: 'web' },
};`;
        }
        if (id === reactNativeSvgVirtualId) {
          return `import React from 'react';
export const Svg = ({ children, ...props }) => React.createElement('svg', props, children);
export const Path = (props) => React.createElement('path', props);
export const G = ({ children, ...props }) => React.createElement('g', props, children);
export default { Svg, Path, G };`;
        }
        if (id === fontAwesomeVirtualId) {
          return `import React from 'react';
export const FontAwesomeIcon = ({ children, ...props }) => React.createElement('span', props, children);
export default { FontAwesomeIcon };`;
        }
        return null;
      },
    },
  ],
});
