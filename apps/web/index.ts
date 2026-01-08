import React from 'react';
import { AppRegistry, Platform } from 'react-native';

import './global.css';

import App from './App';

const appName = 'main';

// Register the native entrypoint so iOS/Android can load the bundle.
AppRegistry.registerComponent(appName, () => App);

if (Platform.OS === 'web') {
  // Load react-dom/client only on web to avoid native bundling issues.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createRoot } = require('react-dom/client');
  const rootElement = document.getElementById('root');
  if (rootElement) {
    const root = createRoot(rootElement);
    root.render(React.createElement(App));
  }
}
