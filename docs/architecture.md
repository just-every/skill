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
  WORKER -- OAuth/SSO --> STYTCH[Stytch]
  WORKER -- Billing events --> STRIPE[Stripe]
  STRIPE -- Webhooks --> WORKER
  STYTCH -- Session verify --> WORKER
```

## Components

- **Expo web app (`apps/web`)**: Boots quickly via `expo-router`, rendering placeholder screens that redirect to the Worker endpoints. The shared UI package (`packages/ui`) houses reusable React Native primitives.
- **Cloudflare Worker (`workers/api`)**: Handles landing pages, the authenticated app shell, Stripe product metadata, and webhooks. Each protected request is validated by calling Stytch’s `sessions.authenticate` before touching D1. R2 is reserved for future asset uploads.
- **Automation (`bootstrap.sh`)**: Creates and links Cloudflare and Stripe resources from declarative `.env` values, then templates `wrangler.toml` so deployments stay reproducible.

## Request Flow Summary

1. A visitor hits `https://{project_id}.justevery.com`. Cloudflare routes traffic to the Worker, which serves a marketing landing page.
2. Selecting **Sign in** loads the Expo `/login` route. The Stytch React B2B component renders in the browser and, once completed, exposes a `session_jwt` to the client.
3. The web app stores the session client-side and sends `Authorization: Bearer <session_jwt>` on every request to the Worker.
4. The Worker calls Stytch’s `sessions.authenticate` endpoint before serving `/app`, `/api/session`, `/api/assets`, or `/payments`. Requests without a valid bearer token receive `401`.
5. Stripe product metadata is currently sourced from environment configuration via `/api/stripe/products`; the webhook `/webhook/stripe` validates Stripe signatures before emitting billing events for later processing.

## Data Storage

- **D1**: Normalised tables for `users`, `sessions`, `projects`, `subscriptions`, and `audit_log` with starter indices.
- **R2**: Placeholder bucket for marketing and user-generated assets. Upload/download endpoints will be added later.

## Deployment

- Local development uses `wrangler dev` for the Worker and `expo start --web` for the client.
- GitHub Actions workflow (`.github/workflows/deploy.yml`) type-checks, tests, and deploys the Worker via Wrangler when credentials are provided.
- `bootstrap.sh` writes `.env.local.generated` to record resource identifiers, making it easy to promote to production or replicate environments.
