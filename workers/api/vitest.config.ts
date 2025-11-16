import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const workspaceRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const loginClientRoot = resolve(workspaceRoot, '../login/src/client');

export default defineConfig({
  test: {
    pool: 'vmThreads',
  },
  resolve: {
    alias: {
      '@justevery/login-client': loginClientRoot,
    },
  },
});
