const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const PLACEHOLDER_FLAG = 'EXPO_PUBLIC_ALLOW_PLACEHOLDER_DATA';

const readMockDataOverride = (): 'true' | 'false' | undefined => {
  if (typeof process === 'undefined' || !process.env) {
    return undefined;
  }
  const raw = process.env[PLACEHOLDER_FLAG];
  if (typeof raw !== 'string') {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true') {
    return 'true';
  }
  if (normalized === 'false') {
    return 'false';
  }
  return undefined;
};

const envOverride = readMockDataOverride();

export function shouldUseMockData(): boolean {
  if (envOverride === 'true') {
    return true;
  }
  if (envOverride === 'false') {
    return false;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  const host = typeof window !== 'undefined' ? window.location?.hostname?.toLowerCase() : undefined;
  if (!host) {
    return false;
  }
  if (LOCAL_HOSTS.has(host)) {
    return true;
  }
  if (host.endsWith('.workers.dev') || host.endsWith('.pages.dev')) {
    return true;
  }
  return false;
}
