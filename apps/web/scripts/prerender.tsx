#!/usr/bin/env tsx
import { promises as fs } from 'node:fs';
import path from 'node:path';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import moduleAlias from 'module-alias';

const codegenShimPath = path.resolve(
  __dirname,
  'shims/react-native-codegen-native-component.ts',
);
const reactNativeShimPath = path.resolve(
  __dirname,
  'prerender-react-native-shim.ts',
);
const expoModulesShimPath = path.resolve(
  __dirname,
  'shims/expo-modules-core.ts',
);
const expoConstantsShimPath = path.resolve(
  __dirname,
  'shims/expo-constants.ts',
);
const expoClipboardShimPath = path.resolve(
  __dirname,
  'shims/expo-clipboard.ts',
);
const expoFileSystemShimPath = path.resolve(
  __dirname,
  'shims/expo-file-system.ts',
);
const expoLinkingShimPath = path.resolve(
  __dirname,
  'shims/expo-linking.ts',
);
const reactNativeInternalsShimPath = path.resolve(
  __dirname,
  'shims/react-native-internals.ts',
);

moduleAlias.addAliases({
  'react-native/Libraries/Utilities/codegenNativeComponent': codegenShimPath,
  'react-native-web/Libraries/Utilities/codegenNativeComponent': codegenShimPath,
  'expo-constants': expoConstantsShimPath,
  'expo-clipboard': expoClipboardShimPath,
  'expo-file-system': expoFileSystemShimPath,
  'expo-linking': expoLinkingShimPath,
});
moduleAlias.addAlias('react-native', reactNativeShimPath);
moduleAlias.addAlias(/^react-native\/.+$/, reactNativeInternalsShimPath);
moduleAlias.addAlias(/^expo-modules-core(\/.*)?$/, expoModulesShimPath);

(globalThis as unknown as { __DEV__?: boolean }).__DEV__ = false;

type RenderDeps = {
  AppRegistry: typeof import('react-native-web').AppRegistry;
  Layout: React.ComponentType<{ children?: React.ReactNode }>;
  Home: React.ComponentType;
  Pricing: React.ComponentType;
  Contact: React.ComponentType;
  RouterProvider: React.ComponentType<{ children?: React.ReactNode }>;
  AuthProvider: React.ComponentType<{
    children?: React.ReactNode;
    loginOrigin: string;
    betterAuthBaseUrl: string;
    sessionEndpoint: string;
  }>;
  DEFAULT_LOGIN_ORIGIN: string;
};

type Route = {
  path: string;
  render: (deps: RenderDeps) => React.ReactNode;
};

const routes: Route[] = [
  {
    path: '/',
    render: (deps) => {
      const HomeComponent = deps.Home;
      return <HomeComponent />;
    },
  },
];

const expoScriptPattern = /<script([^>]*)src="\/_expo\/static\/js\/web\/[^\"]+"([^>]*)><\/script>/i;
const RUNTIME_SHIM_ID = 'justevery-runtime-shim';

const injectRuntimeShim = (html: string): string => {
  if (html.includes(`id="${RUNTIME_SHIM_ID}"`)) {
    return html;
  }
  const shim = `\n    <script id="${RUNTIME_SHIM_ID}">(function(){\n      if (typeof globalThis === 'undefined') { return; }\n      var target = globalThis;\n      if (typeof target.nativePerformanceNow !== 'function') {\n        var perf = target.performance && target.performance.now ? target.performance : { now: function () { return Date.now(); } };\n        var nativeNow = perf.now.bind(perf);\n        target.nativePerformanceNow = nativeNow;\n        if (typeof window !== 'undefined' && !window.nativePerformanceNow) {\n          window.nativePerformanceNow = nativeNow;\n        }\n      }\n      if (!target.__JUSTEVERY_IMPORT_META_ENV__) {\n        target.__JUSTEVERY_IMPORT_META_ENV__ = { MODE: 'production' };\n      }\n      if (typeof window !== 'undefined' && !window.__JUSTEVERY_IMPORT_META_ENV__) {\n        window.__JUSTEVERY_IMPORT_META_ENV__ = target.__JUSTEVERY_IMPORT_META_ENV__;\n      }\n    })();</script>`;
  if (html.includes('</head>')) {
    return html.replace('</head>', `${shim}\n  </head>`);
  }
  return `${shim}\n${html}`;
};

const patchIndexHtml = async (filePath: string): Promise<string> => {
  const html = await fs.readFile(filePath, 'utf8');
  const withShim = injectRuntimeShim(html);
  if (withShim !== html) {
    await fs.writeFile(filePath, withShim, 'utf8');
  }
  return withShim;
};

const patchBundleImportMeta = async (distDir: string): Promise<void> => {
  const bundleDir = path.resolve(distDir, '_expo', 'static', 'js', 'web');
  let entry: string | undefined;
  try {
    const files = await fs.readdir(bundleDir);
    entry = files.find((file) => file.startsWith('index-') && file.endsWith('.js'));
  } catch {
    return;
  }
  if (!entry) {
    return;
  }
  const entryPath = path.join(bundleDir, entry);
  const contents = await fs.readFile(entryPath, 'utf8');
  if (!contents.includes('import.meta.env')) {
    return;
  }
  const patched = contents.replace(/import\.meta\.env/g, '(window.__JUSTEVERY_IMPORT_META_ENV__ || {})');
  await fs.writeFile(entryPath, patched, 'utf8');
};

const loadRenderDeps = (): RenderDeps => ({
  AppRegistry: require('react-native-web').AppRegistry,
  Layout: require('../src/components/Layout').default,
  Home: require('../src/pages/Home').default,
  Pricing: require('../src/pages/Pricing').default,
  Contact: require('../src/pages/Contact').default,
  RouterProvider: require('../src/router/RouterProvider').RouterProvider,
  AuthProvider: require('../src/auth/AuthProvider').AuthProvider,
  DEFAULT_LOGIN_ORIGIN: require('@justevery/config/auth').DEFAULT_LOGIN_ORIGIN,
});

const buildPage = (Component: React.ReactNode, deps: RenderDeps) => {
  const Entry = () => (
    <deps.RouterProvider>
      <deps.AuthProvider
        loginOrigin={deps.DEFAULT_LOGIN_ORIGIN}
        betterAuthBaseUrl={`${deps.DEFAULT_LOGIN_ORIGIN}/api/auth`}
        sessionEndpoint={`${deps.DEFAULT_LOGIN_ORIGIN}/api/auth/session`}
      >
        <deps.Layout>{Component}</deps.Layout>
      </deps.AuthProvider>
    </deps.RouterProvider>
  );
  deps.AppRegistry.registerComponent('Marketing', () => Entry);
  const { element, getStyleElement } = deps.AppRegistry.getApplication('Marketing');
  const html = ReactDOMServer.renderToString(element);
  const styles = ReactDOMServer.renderToStaticMarkup(getStyleElement());
  return { html, styles };
};

async function prerender() {
  const outDir = path.resolve(__dirname, '..', 'dist', 'prerendered');
  await fs.mkdir(outDir, { recursive: true });
  const distRoot = path.resolve(__dirname, '..', 'dist');
  const templatePath = path.join(distRoot, 'index.html');
  await patchBundleImportMeta(distRoot);
  const baseTemplate = await patchIndexHtml(templatePath);

  let deps: RenderDeps | null = null;
  try {
    deps = loadRenderDeps();
  } catch (error) {
    console.warn('SSR prerender dependencies unavailable; falling back to base template.', error);
  }

  for (const route of routes) {
    let document = baseTemplate;

    if (deps) {
      try {
        const { html, styles } = buildPage(route.render(deps), deps);
        document = baseTemplate.replace('<div id="root"></div>', `<div id="root">${html}</div>`);
        document = document.replace('</head>', `${styles}</head>`);
      } catch (renderError) {
        console.warn(`Failed to prerender ${route.path}; writing unrendered template.`, renderError);
      }
    }

    const filename = route.path === '/' ? 'index.html' : `${route.path.replace(/^\//, '')}.html`;
    await fs.writeFile(path.join(outDir, filename), document, 'utf8');
  }
}

prerender().catch((error) => {
  console.error('Failed to prerender marketing pages', error);
  process.exit(1);
});
