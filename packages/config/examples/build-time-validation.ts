/**
 * Example usage for build-time validation
 * Keep existing env.ts pattern for deploy scripts
 */

import { resolveEnv, requiredEnv } from '@justevery/config/env';

// Use existing build-time validation
const env = resolveEnv((key) => process.env[key]);

console.log('Validated env:', env);

// Or check required keys
const required = requiredEnv();
console.log('Required keys:', required);
