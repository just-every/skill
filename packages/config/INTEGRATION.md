# Integration Guide

This guide shows how to integrate `@justevery/config` into existing apps/web and workers/api code.

## Integration for apps/web/src/runtimeEnv.ts

The existing `runtimeEnv.ts` can be refactored to use `@justevery/config/web`:

```ts
// Before: Manual env reading and parsing
const staticEnv = (() => {
  const source = typeof process !== 'undefined' && process.env ? process.env : {};
  const read = (key: string): string | undefined => {
    const value = source[key];
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };
  // ... more manual parsing
})();

// After: Use @justevery/config helpers
import { createWebEnvGetter, parseList } from '@justevery/config/web';

const getEnv = createWebEnvGetter('EXPO_PUBLIC_');
const staticEnv = {
  loginOrigin: getEnv('LOGIN_ORIGIN'),
  betterAuthBaseUrl: getEnv('BETTER_AUTH_URL'),
  sessionEndpoint: getEnv('SESSION_ENDPOINT'),
  scopes: parseList(getEnv('AUTH_SCOPES')),
};
```

## Integration for workers/api/src/index.ts

The worker can use typed helpers for env validation:

```ts
// Before: Manual env access
const loginOrigin = env.LOGIN_ORIGIN;
if (!loginOrigin) {
  throw new Error('Missing LOGIN_ORIGIN');
}

// After: Use @justevery/config helpers
import { validateWorkerEnv, getRequiredWorkerEnv } from '@justevery/config/worker';

validateWorkerEnv(env, ['LOGIN_ORIGIN', 'BETTER_AUTH_URL']);
const required = getRequiredWorkerEnv(env, ['LOGIN_ORIGIN', 'BETTER_AUTH_URL']);
```

## Migration Strategy

1. **Keep existing code working**: The package preserves `env.ts` for build-time validation
2. **Gradual adoption**: Import helpers where they simplify code (not required everywhere)
3. **Zero breaking changes**: All existing patterns continue to work
4. **Optional optimization**: Refactor complex env logic to use package helpers

## Key Benefits

- **Reduce duplication**: Shared helpers for common patterns (normalize, parseList, etc.)
- **Type safety**: Typed getters and validation helpers
- **Consistency**: Same patterns across web and worker contexts
- **Maintainability**: Single source of truth for env utilities

## Example: Simplify Runtime Env

Current code in `apps/web/src/runtimeEnv.ts` has ~280 LOC with manual:
- String trimming/normalization
- List parsing
- Window injection reading
- Env merging logic

With `@justevery/config`, this can be reduced to ~100 LOC by reusing:
- `createWebEnvGetter()` - replaces manual `read()` function
- `parseList()` - replaces manual list parsing
- `getInjectedEnv()` - replaces manual window access
- `mergeEnv()` - replaces manual merging logic
- `normalizeValue()` - replaces manual trimming

See `examples/web-usage.ts` for a simplified version.
