# Production image: `docker compose up -d` (see docker-compose.yml and README).
FROM node:22-bookworm-slim AS base
# Prisma's query engine needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 PRISMA_HIDE_UPDATE_MESSAGE=1

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Nothing is signed at build time; the real secret is only read at runtime.
RUN DATABASE_URL="file:/tmp/build.db" SESSION_SECRET="build-only-placeholder-not-used-at-runtime" \
  sh -c "npx prisma generate && npx next build"

FROM base AS run
ENV NODE_ENV=production \
  DATABASE_URL="file:/data/food-court.db" \
  PORT=43123 \
  HOST=0.0.0.0
COPY --from=build --chown=node:node /app ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 43123
CMD ["sh", "scripts/docker-start.sh"]
