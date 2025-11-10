import * as React from 'react';
import path from 'node:path';

export interface NativeComponentOptions {
  interfaceOnly?: boolean;
  paperComponentName?: string;
  paperComponentNameDeprecated?: string;
  excludedPlatforms?: ReadonlyArray<'iOS' | 'android'>;
  [key: string]: unknown;
}

export type NativeComponentType<Props> = React.ComponentType<Props>;

// Resolve the upstream React Native implementation directly from the workspace root
// so the alias we install for bare `react-native` imports does not affect nested paths.
const reactNativeCodegenPath = path.resolve(
  __dirname,
  '../../../../node_modules/react-native/Libraries/Utilities/codegenNativeComponent.js',
);

// eslint-disable-next-line @typescript-eslint/no-var-requires, import/no-dynamic-require
const codegenNativeComponent: <Props>(
  componentName: string,
  options?: NativeComponentOptions,
) => NativeComponentType<Props> = require(reactNativeCodegenPath);

export default codegenNativeComponent;
