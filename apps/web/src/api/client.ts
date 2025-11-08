import { useCallback } from 'react';

import { useLogto } from '../auth/LogtoProvider';
import { usePublicEnv } from '../runtimeEnv';

const resolveWorkerUrl = (origin?: string, path?: string) => {
  if (!path) {
    return origin ?? '';
  }
  if (!origin && typeof window !== 'undefined') {
    return new URL(path, window.location.origin).toString();
  }
  return new URL(path, origin ?? 'http://127.0.0.1:8787').toString();
};

export const useApiClient = () => {
  const env = usePublicEnv();
  const { getAccessToken } = useLogto();

  const buildUrl = useCallback(
    (path: string) => {
      const origin = env.workerOrigin ?? env.workerOriginLocal;
      return resolveWorkerUrl(origin, path);
    },
    [env.workerOrigin, env.workerOriginLocal]
  );

  const request = useCallback(
    async <T>(path: string, init?: RequestInit & { skipAuth?: boolean }): Promise<T> => {
      const url = buildUrl(path);
      const headers = new Headers(init?.headers ?? {});

      if (!init?.skipAuth) {
        try {
          const token = await getAccessToken(env.apiResource);
          if (token) {
            headers.set('Authorization', `Bearer ${token}`);
          }
        } catch (error) {
          console.warn('Failed to fetch access token for API request', error);
        }
      }

      const response = await fetch(url, {
        ...init,
        credentials: 'include',
        headers
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    },
    [buildUrl, env.apiResource, getAccessToken]
  );

  return {
    get: <T,>(path: string) => request<T>(path, { method: 'GET' }),
    post: <T,>(path: string, body?: unknown) =>
      request<T>(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      }),
    patch: <T,>(path: string, body?: unknown) =>
      request<T>(path, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      }),
    delete: <T,>(path: string) => request<T>(path, { method: 'DELETE' })
  };
};
