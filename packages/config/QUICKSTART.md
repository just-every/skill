# Quick Start Guide

## Install

```bash
pnpm add @justevery/config
```

## 30-second overview

```ts
// Web (Expo/React Native Web)
import { createWebEnvGetter, parseList } from '@justevery/config/web';

const getEnv = createWebEnvGetter('EXPO_PUBLIC_');
const config = {
  apiUrl: getEnv('API_URL'),
  scopes: parseList(getEnv('SCOPES')),
};

// Worker (Cloudflare)
import { validateWorkerEnv, getRequiredWorkerEnv } from '@justevery/config/worker';

export default {
  async fetch(request, env, ctx) {
    validateWorkerEnv(env, ['API_KEY', 'DB_URL']);
    const { API_KEY } = getRequiredWorkerEnv(env, ['API_KEY']);
    // ...
  }
}

// Build scripts
import { resolveEnv } from '@justevery/config/env';
const env = resolveEnv((key) => process.env[key]);
```

## Common patterns

### Read environment variables

```ts
import { createWebEnvGetter } from '@justevery/config/web';

const getEnv = createWebEnvGetter('EXPO_PUBLIC_');
const apiUrl = getEnv('API_URL'); // reads EXPO_PUBLIC_API_URL
```

### Parse comma-separated lists

```ts
import { parseList } from '@justevery/config/web';

const scopes = parseList('read,write, admin'); // ['read', 'write', 'admin']
```

### Validate worker environment

```ts
import { validateWorkerEnv } from '@justevery/config/worker';

// Throws if any keys are missing/empty
validateWorkerEnv(env, ['DATABASE_URL', 'API_KEY']);
```

### Extract required worker env

```ts
import { getRequiredWorkerEnv } from '@justevery/config/worker';

// Type-safe extraction, throws if missing
const { DATABASE_URL, API_KEY } = getRequiredWorkerEnv(env, ['DATABASE_URL', 'API_KEY']);
```

### Merge environment sources

```ts
import { mergeEnv, getInjectedEnv } from '@justevery/config/web';

const staticEnv = { apiUrl: 'http://localhost' };
const injected = getInjectedEnv(); // window.__JUSTEVERY_ENV__
const merged = mergeEnv(staticEnv, injected); // injected overrides static
```

### Fetch runtime environment

```ts
import { fetchRuntimeEnv } from '@justevery/config/web';

const runtimeEnv = await fetchRuntimeEnv('/api/runtime-env');
if (runtimeEnv) {
  console.log('Runtime env loaded', runtimeEnv);
}
```

## Full examples

See `examples/` directory:
- `web-usage.ts` - Complete apps/web integration
- `worker-usage.ts` - Complete workers/api integration
- `build-time-validation.ts` - Deploy script usage

## API Reference

Full API docs in [README.md](./README.md)

## Need help?

- Check [INTEGRATION.md](./INTEGRATION.md) for migration guide
- See [SUMMARY.md](./SUMMARY.md) for design decisions
- Run integration test: `npx tsx packages/config/test-integration.ts`
