#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');
const vitestBin = path.join(workspaceRoot, 'node_modules', 'vitest', 'vitest.mjs');

const specs = [
  'test/accountProvisioning.test.ts',
  'test/checkout.test.ts',
  'test/index.test.ts',
  'test/runnerStorage.test.ts',
  'test/billing.test.ts',
  'test/billingGaps.test.ts',
  'test/session.test.ts',
];

async function runSpec(spec) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--max-old-space-size=4096', vitestBin, 'run', spec],
      {
        cwd: workspaceRoot,
        stdio: 'inherit',
      },
    );

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Vitest failed for ${spec} (exit code ${code})`));
      }
    });
  });
}

async function main() {
  for (const spec of specs) {
    console.log(`\n> vitest run ${spec}`);
    await runSpec(spec);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
