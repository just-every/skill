import React from 'react';
import { AppRegistry } from 'react-native';
import { createRoot } from 'react-dom/client';

import './global.css';

import App from './App';

const appName = 'main';

// Register the native entrypoint so iOS/Android can load the bundle.
AppRegistry.registerComponent(appName, () => App);

// Keep the existing web entrypoint so Expo Web continues to work.
if (typeof document !== 'undefined') {
  const rootElement = document.getElementById('root');

  if (rootElement) {
    const root = createRoot(rootElement);
    root.render(React.createElement(App));
  }
}
