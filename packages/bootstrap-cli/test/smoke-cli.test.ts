import { beforeEach, describe, expect, it, vi } from 'vitest';

const runSmokeMock = vi.fn();

vi.mock('../src/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    runSmoke: (...args: unknown[]) => runSmokeMock(...args)
  };
});

import { createCli } from '../src/cli.js';

beforeEach(() => {
  runSmokeMock.mockReset();
  runSmokeMock.mockResolvedValue(undefined);
});

describe('bootstrap smoke CLI', () => {
  it('parses flags and forwards them to runSmoke', async () => {
    const program = createCli();
    await program.parseAsync([
      'node',
      'bootstrap',
      'smoke',
      '--base',
      'https://demo.example.com/app',
      '--mode',
      'minimal',
      '--routes',
      '/health,/app',
      '--token',
      'token-123',
      '--out',
      'out-dir',
      '--stamp',
      'stamp',
      '--skip-wrangler',
      '--attempts',
      '5',
      '--delay-ms',
      '200',
      '--project-id',
      'demo-project',
      '--d1-name',
      'demo-db',
      '--r2-bucket',
      'demo-bucket'
    ]);

    expect(runSmokeMock).toHaveBeenCalledWith({
      cwd: undefined,
      base: 'https://demo.example.com/app',
      mode: 'minimal',
      routes: ['/health', '/app'],
      token: 'token-123',
      outputDir: 'out-dir',
      stamp: 'stamp',
      skipWrangler: true,
      attempts: 5,
      delayMs: 200,
      headless: true,
      projectId: 'demo-project',
      d1Name: 'demo-db',
      r2Bucket: 'demo-bucket'
    });
  });

  it('honours --no-headless flag', async () => {
    const program = createCli();
    await program.parseAsync([
      'node',
      'bootstrap',
      'smoke',
      '--base',
      'https://demo.example.com',
      '--no-headless'
    ]);

    expect(runSmokeMock).toHaveBeenCalledWith({
      cwd: undefined,
      base: 'https://demo.example.com',
      mode: 'full',
      routes: undefined,
      token: undefined,
      outputDir: undefined,
      stamp: undefined,
      skipWrangler: false,
      attempts: undefined,
      delayMs: undefined,
      headless: false,
      projectId: undefined,
      d1Name: undefined,
      r2Bucket: undefined
    });
  });
});

