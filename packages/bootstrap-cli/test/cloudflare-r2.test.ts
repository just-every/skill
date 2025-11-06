import { afterEach, describe, expect, it, vi } from 'vitest';
import * as cloudflare from '../src/providers/cloudflare.js';

const { __cloudflareInternals } = cloudflare;
type CloudflareR2Bucket = cloudflare.CloudflareR2Bucket;

describe('Cloudflare R2 bucket detection', () => {
  let runWranglerMock: vi.MockedFunction<typeof cloudflare.runWrangler>;

  beforeEach(() => {
    runWranglerMock = vi.fn();
    __cloudflareInternals.setRunWranglerDelegate(runWranglerMock);
  });

  afterEach(() => {
    __cloudflareInternals.resetRunWranglerDelegate();
    vi.restoreAllMocks();
  });

  it('returns buckets from JSON wrangler output', async () => {
    runWranglerMock
      .mockResolvedValueOnce(JSON.stringify([{ name: 'demo-assets' }]))
      .mockResolvedValueOnce('');

    const buckets = await __cloudflareInternals.listR2BucketsWithFallback({}, 'acct', 'token');

    expect(buckets).toEqual<CloudflareR2Bucket[]>([{ name: 'demo-assets' }]);
    expect(runWranglerMock).toHaveBeenCalledWith(
      ['r2', 'bucket', 'list', '--json'],
      expect.any(Object),
      expect.objectContaining({ ignoreFailure: true })
    );
  });

  it('falls back to plain output parsing when JSON output is empty', async () => {
    const plainTable = `
┌──────────┬──────────────┬──────────────┐
│ name     │ created      │ location     │
├──────────┼──────────────┼──────────────┤
│ demo-one │ 2024-01-01   │ auto         │
│ demo-two │ 2024-01-02   │ auto         │
└──────────┴──────────────┴──────────────┘
`;

    runWranglerMock
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce(plainTable);

    const buckets = await __cloudflareInternals.listR2BucketsWithFallback({}, 'acct', 'token');

    expect(buckets).toEqual<CloudflareR2Bucket[]>([
      { name: 'demo-one' },
      { name: 'demo-two' }
    ]);
  });

  it('falls back to Cloudflare API when CLI output is unavailable', async () => {
    runWranglerMock.mockResolvedValue('');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, result: [{ name: 'api-bucket' }] })
    });
    const originalFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      const buckets = await __cloudflareInternals.listR2BucketsWithFallback({}, 'acct', 'token');
      expect(buckets).toEqual<CloudflareR2Bucket[]>([{ name: 'api-bucket' }]);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/acct/r2/buckets',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer token' })
        })
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('parses plain output helper accurately', () => {
    const buckets = __cloudflareInternals.parseR2BucketsFromPlainOutput(`
name created
example-one 2024-01-01
example-two 2024-01-02
`);
    expect(buckets).toEqual<CloudflareR2Bucket[]>([
      { name: 'example-one' },
      { name: 'example-two' }
    ]);
  });
});
