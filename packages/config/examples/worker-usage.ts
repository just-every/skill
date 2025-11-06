/**
 * Example usage for Cloudflare Workers
 * workers/api/src/index.ts
 */

import { createWorkerEnvGetter, getRequiredWorkerEnv, getOptionalWorkerEnv, validateWorkerEnv } from '@justevery/config/worker';

// Define your worker env bindings interface
export interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  LOGTO_ISSUER: string;
  LOGTO_JWKS_URI: string;
  LOGTO_API_RESOURCE: string;
  LOGTO_ENDPOINT?: string;
  LOGTO_APPLICATION_ID?: string;
  APP_BASE_URL?: string;
  PROJECT_DOMAIN?: string;
}

// Example 1: Extract required env at startup
const REQUIRED_KEYS = ['LOGTO_ISSUER', 'LOGTO_JWKS_URI', 'LOGTO_API_RESOURCE'] as const;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Validate required keys
    validateWorkerEnv(env, REQUIRED_KEYS);

    // Extract required env
    const required = getRequiredWorkerEnv(env, REQUIRED_KEYS);

    // Extract optional env
    const optional = getOptionalWorkerEnv(env, ['LOGTO_ENDPOINT', 'APP_BASE_URL'] as const);

    // Use env values
    const logtoIssuer = required.LOGTO_ISSUER;
    const appBaseUrl = optional.APP_BASE_URL ?? '/app';

    return new Response(JSON.stringify({ logtoIssuer, appBaseUrl }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
} satisfies ExportedHandler<Env>;

// Example 2: Create a typed getter
export function useWorkerEnv(env: Env) {
  const getEnv = createWorkerEnvGetter(env);

  return {
    logtoIssuer: getEnv('LOGTO_ISSUER')!,
    logtoJwksUri: getEnv('LOGTO_JWKS_URI')!,
    apiResource: getEnv('LOGTO_API_RESOURCE')!,
    appBaseUrl: getEnv('APP_BASE_URL') ?? '/app',
  };
}
