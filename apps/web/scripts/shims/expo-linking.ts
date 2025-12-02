const getOrigin = (): string => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost';
};

export const createURL = (path = ''): string => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${getOrigin()}${normalized}`;
};

export const parse = (url: string) => {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.startsWith('/') ? parsed.pathname.slice(1) : parsed.pathname;
    const queryParams = Object.fromEntries(parsed.searchParams.entries());
    return { hostname: parsed.hostname, path, queryParams };
  } catch {
    return { path: undefined, queryParams: undefined };
  }
};

export default { createURL, parse };
