# syntax=docker/dockerfile:1.7
# Build context: repository root.  docker build -f apps/web/Dockerfile -t quizforge-web .
# current Node 22 LTS patch release; the Trivy gate in CI fails the build on fixable HIGH/CRITICAL findings
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-slim AS build
RUN npm install -g pnpm@10.34.6 && pnpm config set store-dir /pnpm-store
WORKDIR /repo
COPY . .
RUN --mount=type=cache,target=/pnpm-store pnpm install --frozen-lockfile --filter @quizforge/web...
ENV NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @quizforge/web build

FROM node:${NODE_VERSION}-slim AS runtime
# security patches for the OS packages of the base image (Trivy gate: no fixable HIGH/CRITICAL)
RUN apt-get update && apt-get -y --no-install-recommends upgrade && rm -rf /var/lib/apt/lists/*
# the runtime never installs packages: dropping npm/corepack removes their bundled dependencies (and CVEs) from the image
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn* /usr/local/bin/yarn*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
