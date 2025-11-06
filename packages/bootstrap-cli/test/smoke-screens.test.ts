import { describe, expect, it, vi } from 'vitest';
import { captureSmokeScreens } from '../src/smoke/screens.js';

const closeMock = vi.fn(async () => {});
const gotoMock = vi.fn(async () => ({ status: () => 200 }));
const waitForTimeoutMock = vi.fn(async () => {});
const screenshotMock = vi.fn(async () => {});

vi.mock('@playwright/test', () => ({
  chromium: {
    launch: vi.fn(async () => ({
      newContext: async () => ({
        newPage: async () => ({
          goto: gotoMock,
          waitForTimeout: waitForTimeoutMock,
          screenshot: screenshotMock,
          close: closeMock
        }),
        close: closeMock
      }),
      close: closeMock
    }))
  }
}));

describe('captureSmokeScreens', () => {
  it('captures screenshots for each route', async () => {
    const result = await captureSmokeScreens({
      baseUrl: 'https://example.com',
      routes: ['/'],
      bearerToken: null,
      outputRoot: 'test-results/smoke-test',
      stamp: 'screens'
    });

    expect(result.screenshots).toHaveLength(1);
    expect(gotoMock).toHaveBeenCalled();
  });
});
