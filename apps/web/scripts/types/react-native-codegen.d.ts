import * as React from 'react';

declare module 'react-native/Libraries/Utilities/codegenNativeComponent' {
  export interface NativeComponentOptions {
    interfaceOnly?: boolean;
    paperComponentName?: string;
    paperComponentNameDeprecated?: string;
    excludedPlatforms?: ReadonlyArray<'iOS' | 'android'>;
    [key: string]: unknown;
  }

  export type NativeComponentType<Props> = React.ComponentType<Props>;

  export default function codegenNativeComponent<Props>(
    componentName: string,
    options?: NativeComponentOptions,
  ): NativeComponentType<Props>;
}
