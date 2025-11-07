#!/usr/bin/env tsx
import { promises as fs } from 'node:fs';
import path from 'node:path';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import moduleAlias from 'module-alias';
moduleAlias.addAlias('react-native', 'react-native-web');

import { AppRegistry } from 'react-native-web';
import Layout from '../src/components/Layout';
import Home from '../src/pages/Home';
import Pricing from '../src/pages/Pricing';
import Contact from '../src/pages/Contact';
import { RouterProvider } from '../src/router/RouterProvider';
import { HybridLogtoProvider } from '../src/auth/LogtoProvider';
import { AuthConfigProvider } from '../src/auth/AuthConfig';

const routes = [
  { path: '/', component: <Home /> },
  { path: '/pricing', component: <Pricing /> },
  { path: '/contact', component: <Contact /> }
];

const expoScriptPattern = /<script([^>]*)src="\/_expo\/static\/js\/web\/[^\"]+"([^>]*)><\/script>/i;
const RUNTIME_SHIM_ID = 'justevery-runtime-shim';

const ensureModuleScripts = (html: string): string => {
  return html.replace(/<script(?![^>]*type=)([^>]*)src="\/_expo\/static\/js\/web\/([^\"]+)"([^>]*)>/g, '<script type="module"$1 src="/_expo/static/js/web/$2"$3>');
};

const injectRuntimeShim = (html: string): string => {
  if (html.includes(`id="${RUNTIME_SHIM_ID}"`)) {
    return html;
  }
  const shim = `\n    <script id="${RUNTIME_SHIM_ID}">(function(){\n      if (typeof window === 'undefined') { return; }\n      if (typeof window.nativePerformanceNow !== 'function') {\n        var perf = window.performance && window.performance.now ? window.performance : { now: function () { return Date.now(); } };\n        window.nativePerformanceNow = perf.now.bind(perf);\n      }\n      if (!window.__JUSTEVERY_IMPORT_META_ENV__) {\n        window.__JUSTEVERY_IMPORT_META_ENV__ = { MODE: 'production' };\n      }\n    })();</script>`;
  if (html.includes('</head>')) {
    return html.replace('</head>', `${shim}\n  </head>`);
  }
  return `${shim}\n${html}`;
};

const patchIndexHtml = async (filePath: string): Promise<string> => {
  const html = await fs.readFile(filePath, 'utf8');
  const withModule = ensureModuleScripts(html);
  const withShim = injectRuntimeShim(withModule);
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

const buildPage = (Component: React.ReactNode) => {
  const Entry = () => (
    <RouterProvider>
      <HybridLogtoProvider config={{ endpoint: '', appId: '' }}>
        <AuthConfigProvider value={{ redirectUri: '/', redirectUriLocal: '/', redirectUriProd: '/', logoutRedirectUri: '/' }}>
          <Layout>{Component}</Layout>
        </AuthConfigProvider>
      </HybridLogtoProvider>
    </RouterProvider>
  );
  AppRegistry.registerComponent('Marketing', () => Entry);
  const { element, getStyleElement } = AppRegistry.getApplication('Marketing');
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

  for (const route of routes) {
    const { html, styles } = buildPage(route.component);
    let document = baseTemplate.replace('<div id="root"></div>', `<div id="root">${html}</div>`);
    document = document.replace('</head>', `${styles}</head>`);
    const filename = route.path === '/' ? 'index.html' : `${route.path.replace(/^\//, '')}.html`;
    await fs.writeFile(path.join(outDir, filename), document, 'utf8');
  }
}

prerender().catch((error) => {
  console.error('Failed to prerender marketing pages', error);
  process.exit(1);
});
