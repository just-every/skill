import React from 'react';

import Layout from './src/components/Layout';
import { Home, Skills } from './src/pages';
import { RouterProvider, useRouterContext } from './src/router/RouterProvider';

const RoutedView = () => {
  const { path } = useRouterContext();
  const cleanPath = path.replace(/[#?].*$/, '');

  const content = (() => {
    switch (cleanPath) {
      case '/skills':
        return <Skills />;
      case '/':
        return <Home />;
      default:
        return <Home />;
    }
  })();

  return <Layout>{content}</Layout>;
};

const App = () => {
  return (
    <RouterProvider>
      <RoutedView />
    </RouterProvider>
  );
};

export default App;
