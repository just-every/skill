const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const envOverride =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_ALLOW_PLACEHOLDER_DATA
    ? process.env.EXPO_PUBLIC_ALLOW_PLACEHOLDER_DATA.toLowerCase()
    : undefined;

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
  const host = window.location.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host)) {
    return true;
  }
  if (host.endsWith('.workers.dev') || host.endsWith('.pages.dev')) {
    return true;
  }
  return false;
}
