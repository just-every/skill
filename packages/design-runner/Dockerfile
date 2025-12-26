FROM node:20-bookworm

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends git python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.12.4 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages

RUN pnpm install --filter @just-every/ensemble --filter @just-every/code-design --filter @justevery/design-runner
RUN pnpm --filter @just-every/ensemble build
RUN pnpm --filter @just-every/code-design build

WORKDIR /app/packages/design-runner

CMD ["node", "run-job.mjs"]
