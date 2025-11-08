/**
 * Example usage for Cloudflare Workers env bindings
 */

import { createWorkerEnvGetter, getRequiredWorkerEnv, getOptionalWorkerEnv, validateWorkerEnv } from '@justevery/config/worker';

export interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  LOGIN_ORIGIN: string;
  BETTER_AUTH_URL: string;
  SESSION_COOKIE_DOMAIN?: string;
  APP_BASE_URL?: string;
  PROJECT_DOMAIN?: string;
}

const REQUIRED_KEYS = ['LOGIN_ORIGIN', 'BETTER_AUTH_URL'] as const;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    validateWorkerEnv(env, REQUIRED_KEYS);
    const required = getRequiredWorkerEnv(env, REQUIRED_KEYS);
    const optional = getOptionalWorkerEnv(env, ['SESSION_COOKIE_DOMAIN', 'APP_BASE_URL'] as const);

    return new Response(
      JSON.stringify({
        loginOrigin: required.LOGIN_ORIGIN,
        betterAuthUrl: required.BETTER_AUTH_URL,
        sessionCookieDomain: optional.SESSION_COOKIE_DOMAIN ?? '.justevery.com',
        appBaseUrl: optional.APP_BASE_URL ?? '/app',
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  },
} satisfies ExportedHandler<Env>;

export function useWorkerEnv(env: Env) {
  const getEnv = createWorkerEnvGetter(env);

  return {
    loginOrigin: getEnv('LOGIN_ORIGIN')!,
    betterAuthUrl: getEnv('BETTER_AUTH_URL')!,
    sessionCookieDomain: getEnv('SESSION_COOKIE_DOMAIN') ?? '.justevery.com',
  };
}
