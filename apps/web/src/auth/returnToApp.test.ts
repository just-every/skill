import { describe, expect, it } from 'vitest';

import { isReturnToAppUrl } from './returnToApp';

describe('isReturnToAppUrl', () => {
  it('accepts the configured app schemes', () => {
    expect(isReturnToAppUrl('justevery://callback?return=%2Fapp%2Foverview')).toBe(true);
    expect(isReturnToAppUrl('com.justevery.manager://callback?return=%2Fapp%2Foverview')).toBe(true);
  });

  it('accepts exp+* schemes used by Expo builds', () => {
    expect(isReturnToAppUrl('exp+demo://callback?return=%2Fapp%2Foverview')).toBe(true);
  });

  it('treats same-origin HTTP(S) as return-to-app when appOrigin is provided', () => {
    expect(isReturnToAppUrl('https://127.0.0.1:8081/callback?return=%2Fapp%2Foverview')).toBe(false);
    expect(
      isReturnToAppUrl('https://127.0.0.1:8081/callback?return=%2Fapp%2Foverview', {
        appOrigin: 'https://127.0.0.1:8081',
      })
    ).toBe(true);
  });

  it('rejects unrelated schemes and invalid urls', () => {
    expect(isReturnToAppUrl('mailto:support@justevery.com')).toBe(false);
    expect(isReturnToAppUrl('not a url')).toBe(false);
  });
});
