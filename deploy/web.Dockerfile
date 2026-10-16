# Web app (Expo static export) served by Caddy, which also proxies /api to the API.
# Build context: the repository root (see deploy/compose.yml).

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/app/package.json apps/app/
COPY packages/contracts/package.json packages/contracts/
COPY packages/ui/package.json packages/ui/
RUN npm ci --workspace @vagabonds/app --no-audit --no-fund
COPY packages packages
COPY apps/app apps/app
# Where the web app calls the API. Same origin through Caddy, so a relative path works.
ARG EXPO_PUBLIC_API_URL=/api
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL
RUN cd apps/app && npx expo export --platform web --output-dir /app/web

FROM caddy:2.10-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/web /srv/web
