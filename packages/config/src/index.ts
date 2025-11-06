/**
 * @justevery/config
 *
 * Minimal, typed environment configuration for web (Expo/React Native Web) and Cloudflare Workers.
 * Zero external runtime dependencies (zod optional for validation).
 */

export * from './web.js';
export * from './worker.js';
export * from './env.js';
export type { EnvGetter, EnvSchema, ValidatedEnv } from './types.js';
