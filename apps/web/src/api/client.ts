import { useCallback } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { usePublicEnv } from '../runtimeEnv';

const resolveWorkerUrl = (origin?: string, path?: string) => {
  if (!path) {
    return origin ?? '';
  }

  const normalizedOrigin = normaliseWorkerOrigin(origin);

  if (!normalizedOrigin && typeof window !== 'undefined') {
    return new URL(path, window.location.origin).toString();
  }

  return new URL(path, normalizedOrigin ?? 'http://127.0.0.1:8787').toString();
};

const normaliseWorkerOrigin = (origin?: string): string | undefined => {
  if (typeof origin !== 'string') {
    return undefined;
  }
  const trimmed = origin.trim();
  if (!trimmed) {
    return undefined;
  }

  if (typeof window === 'undefined') {
    return trimmed;
  }

  const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!isLocalHost && window.location.protocol === 'https:' && trimmed.startsWith('http://')) {
    return window.location.origin;
  }

  return trimmed;
};

export const useApiClient = () => {
  const env = usePublicEnv();
  const { status } = useAuth();

  const buildUrl = useCallback(
    (path: string) => resolveWorkerUrl(env.workerOrigin ?? env.workerOriginLocal, path),
    [env.workerOrigin, env.workerOriginLocal]
  );

  const request = useCallback(
    async <T>(path: string, init?: RequestInit): Promise<T> => {
      const url = buildUrl(path);
      const headers = new Headers(init?.headers ?? {});
      if (!headers.has('Content-Type') && init?.body) {
        headers.set('Content-Type', 'application/json');
      }

      const response = await fetch(url, {
        ...init,
        credentials: 'include',
        headers,
      });

      if (response.status === 204) {
        return undefined as T;
      }

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required');
        }
        throw new Error(`API request failed: ${response.status}`);
      }

      return (await response.json()) as T;
    },
    [buildUrl, status]
  );

  return {
    get: <T,>(path: string) => request<T>(path, { method: 'GET' }),
    post: <T,>(path: string, body?: unknown) =>
      request<T>(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      }),
    patch: <T,>(path: string, body?: unknown) =>
      request<T>(path, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      }),
    delete: <T,>(path: string) => request<T>(path, { method: 'DELETE' }),
  };
};
