# API and dataset-import images for the demo server (see docs/deploy.md).
# Build context: the repository root, e.g. `docker compose -f deploy/compose.yml build`.
#
#   target `api`:  Fastify API, runs as the unprivileged `node` user
#   target `seed`: one-off job that applies migrations and imports data/ (same steps as CI)

FROM node:24-bookworm-slim AS deps
WORKDIR /app
# Every workspace manifest is needed for `npm ci` to accept the lockfile;
# only the API's dependencies are installed.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/app/package.json apps/app/
COPY packages/contracts/package.json packages/contracts/
COPY packages/ui/package.json packages/ui/
# `postinstall` generates the Prisma client from the schema; the URL is only a placeholder.
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    npm ci --workspace @vagabonds/api --no-audit --no-fund \
 && npm cache clean --force

FROM deps AS api
ENV NODE_ENV=production
COPY packages/contracts packages/contracts
COPY apps/api apps/api
# Labels for confidence, accessibility and media kinds (apps/api/src/lib/enums.ts).
COPY data/enums.json data/enums.json
WORKDIR /app/apps/api
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["npx", "--no-install", "tsx", "src/server.ts"]

FROM api AS seed
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv \
 && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir "psycopg[binary]>=3.2,<4"
# Prisma downloads its schema engine on first use; do it now, while node_modules is writable.
RUN npx --no-install prisma --version
COPY data /app/data
USER node
HEALTHCHECK NONE
CMD ["sh", "-c", "npx --no-install prisma migrate deploy && /opt/venv/bin/python /app/data/tools/import_to_db.py --verify"]
