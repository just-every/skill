export type ReturnToAppOptions = {
  appOrigin?: string;
};

const DEFAULT_RETURN_TO_APP_SCHEMES = new Set(['exp', 'bareexpo', 'justevery', 'com.justevery.manager']);

export function isReturnToAppUrl(value: string, options: ReturnToAppOptions = {}): boolean {
  try {
    const url = new URL(value);
    const scheme = url.protocol.replace(':', '').toLowerCase();

    if (scheme.startsWith('exp+')) return true;
    if (DEFAULT_RETURN_TO_APP_SCHEMES.has(scheme)) return true;

    const appOrigin = options.appOrigin;
    if (appOrigin && value.startsWith(appOrigin)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

