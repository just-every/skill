# Architecture Overview

```mermaid
graph LR
  subgraph Browser
    EXPO["Expo Web\n(apps/web)"]
  end

  subgraph Cloudflare
    WORKER["Worker (workers/api)"]
    D1[(D1: data)]
    R2[(R2: assets)]
  end

  EXPO -- HTTPS / fetch --> WORKER
  WORKER -- SQL --> D1
  WORKER -- objects --> R2
  WORKER -- OAuth/SSO --> LOGTO[Logto]
  WORKER -- Billing events --> STRIPE[Stripe]
  STRIPE -- Webhooks --> WORKER
  LOGTO -- JWKS --> WORKER
```

## Components

- **Expo web app (`apps/web`)**: Boots quickly via `expo-router`, rendering placeholder screens that redirect to the Worker endpoints. The shared UI package (`packages/ui`) houses reusable React Native primitives.
- **Cloudflare Worker (`workers/api`)**: Handles landing pages, the authenticated app shell, Stripe product metadata, and webhooks. Each protected request is validated locally by verifying Logto-issued JWTs against the tenant JWKS before touching D1. R2 is reserved for future asset uploads.
- **Automation (`bootstrap.sh`)**: Creates and links Cloudflare and Stripe resources from declarative `.env` values, then templates `wrangler.toml` so deployments stay reproducible.

## Request Flow Summary

1. A visitor hits `https://{project_id}.justevery.com`. Cloudflare routes traffic to the Worker, which serves a marketing landing page.
2. Selecting **Sign in** loads the Expo `/login` route. The Logto React SDK initiates the hosted login and, once completed, exposes an access token to the client.
3. The web app stores the session client-side and sends `Authorization: Bearer <token>` on every request to the Worker.
4. The Worker verifies the token using Logto’s issuer and JWKS configuration before serving `/app`, `/api/session`, `/api/assets`, or `/payments`. Requests without a valid bearer token receive `401`.
5. Stripe product metadata is currently sourced from environment configuration via `/api/stripe/products`; the webhook `/webhook/stripe` validates Stripe signatures before emitting billing events for later processing.

## Data Storage

- **D1**: Normalised tables for `users`, `sessions`, `projects`, `subscriptions`, and `audit_log` with starter indices.
- **R2**: Placeholder bucket for marketing and user-generated assets. Upload/download endpoints will be added later.

## Deployment

- Local development uses `wrangler dev` for the Worker and `expo start --web` for the client.
- GitHub Actions workflow (`.github/workflows/deploy.yml`) type-checks, tests, and deploys the Worker via Wrangler when credentials are provided.
- `bootstrap.sh` writes `.env.local.generated` to record resource identifiers, making it easy to promote to production or replicate environments.
