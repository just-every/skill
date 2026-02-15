import { defineConfig } from 'vitest/config';
import path from 'node:path';

const reactNativeVirtualId = '\0vitest-react-native-stub';
const reactNativeSvgVirtualId = '\0vitest-react-native-svg-stub';
const reactNativeWebViewVirtualId = '\0vitest-react-native-webview-stub';
const fontAwesomeVirtualId = '\0vitest-fontawesome-stub';
const expoModulesVirtualId = '\0vitest-expo-modules-core-stub';
const expoConstantsVirtualId = '\0vitest-expo-constants-stub';
const expoClipboardVirtualId = '\0vitest-expo-clipboard-stub';
const expoFileSystemVirtualId = '\0vitest-expo-file-system-stub';

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
        if (source === 'react-native-webview' || source.startsWith('react-native-webview/')) {
          return reactNativeWebViewVirtualId;
        }
        if (source === '@fortawesome/react-native-fontawesome') {
          return fontAwesomeVirtualId;
        }
        if (source === 'expo-modules-core' || source.startsWith('expo-modules-core/')) {
          return expoModulesVirtualId;
        }
        if (source === 'expo-constants') {
          return expoConstantsVirtualId;
        }
        if (source === 'expo-clipboard') {
          return expoClipboardVirtualId;
        }
        if (source === 'expo-file-system') {
          return expoFileSystemVirtualId;
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
const TextInput = React.forwardRef(({ children, value, onChangeText, ...props }, ref) =>
  React.createElement('textarea', {
    ref,
    value: value ?? '',
    ...mapProps(props),
    onChange: (event) => onChangeText?.(event?.target?.value ?? ''),
  }, children)
);
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
const Platform = {
  OS: 'web',
  select: (spec) => spec?.web ?? spec?.default ?? spec?.native ?? spec,
};
export { View, Text, ScrollView, ActivityIndicator, TextInput, Pressable, Platform };
export default {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Pressable,
  StyleSheet: { create: (styles) => styles },
  Platform,
};`;
        }
        if (id === reactNativeWebViewVirtualId) {
          return `import React from 'react';

export const WebView = React.forwardRef(({ children, testID, ...props }, ref) =>
  React.createElement('iframe', { ref, 'data-testid': testID, ...props }, children)
);

export default WebView;`;
        }
        if (id === expoModulesVirtualId) {
          return `class CodedError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
class UnavailabilityError extends CodedError {
  constructor(moduleName, propertyName) {
    super(
      'ERR_MODULE_UNAVAILABLE',
      moduleName + '.' + propertyName + ' is not available on web test environment.'
    );
  }
}
class EventEmitter {
  addListener() {
    return { remove: () => {} };
  }
  removeAllListeners() {}
  emit() {}
  removeSubscription() {}
}
const Platform = { OS: 'web', select: (spec) => spec?.web ?? spec?.default ?? spec?.native ?? spec };
const NativeModules = {};
const NativeModulesProxy = {};
const requireNativeModule = (_name) => ({
  getLinkingURL: () => null,
});
const requireOptionalNativeModule = (_name) => null;
const NativeModule = class {};
globalThis.ExpoModulesCore = { EventEmitter };
export { CodedError, UnavailabilityError, EventEmitter, Platform, NativeModules, NativeModulesProxy, requireNativeModule, requireOptionalNativeModule, NativeModule };
export default {
  CodedError,
  UnavailabilityError,
  EventEmitter,
  Platform,
  NativeModules,
  NativeModulesProxy,
  requireNativeModule,
  requireOptionalNativeModule,
  NativeModule,
};`;
        }
        if (id === expoConstantsVirtualId) {
          return `const Constants = {
  appOwnership: null,
  expoConfig: { hostUri: '127.0.0.1' },
  manifest2: { extra: { expoClient: { hostUri: '127.0.0.1' } } },
};
export default Constants;
export const ExecutionEnvironment = { Standalone: 'standalone' };
export const UserInterfaceIdiom = { Phone: 'phone', Tablet: 'tablet', Unknown: 'unknown' };`;
        }
        if (id === expoClipboardVirtualId) {
          return `export const setStringAsync = async () => {};
export default { setStringAsync };`;
        }
        if (id === expoFileSystemVirtualId) {
          return `export const cacheDirectory = '/tmp/';
export const EncodingType = { UTF8: 'utf8' };
export const writeAsStringAsync = async () => {};
export const readAsStringAsync = async () => '';
export const deleteAsync = async () => {};
export default {
  cacheDirectory,
  EncodingType,
  writeAsStringAsync,
  readAsStringAsync,
  deleteAsync,
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
