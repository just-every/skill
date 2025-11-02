# justevery Starter Stack

This repository provides the baseline Cloudflare-first stack used to bootstrap new projects under the `justevery.com` domain. It includes:

- An Expo (React Native) web application scaffold under `apps/web`.
- A Cloudflare Worker in `workers/api` that fronts authentication, Stripe integration, and static HTML placeholders.
- Infrastructure automation via `bootstrap.sh`, which provisions Cloudflare D1, R2, and KV resources, templates Wrangler configuration, and seeds Stripe products.
- Documentation, migrations, and CI workflows so the project is deployable with minimal additional setup.

Refer to `PLAN.md` for the architectural roadmap and to `docs/bootstrap.md` for provisioning details.
