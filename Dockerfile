FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV COREPACK_HOME=/opt/corepack
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends patch && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
COPY upstream/ /app/
COPY patches/ /tmp/patches/

# Fail the build if an upstream change makes any compatibility patch obsolete.
RUN patch -p1 < /tmp/patches/postgres-adapter.patch \
    && patch -p1 < /tmp/patches/self-hosted-auth.patch \
    && patch -p1 < /tmp/patches/optional-github-app.patch \
    && patch -p1 < /tmp/patches/optional-encryption-keys.patch \
    && pnpm install --frozen-lockfile

ARG PUBLIC_APP_URL=http://localhost:3000
ARG PUBLIC_STORAGE_BASE_URL=
ENV NEXT_PUBLIC_FF_API_ORIGIN=${PUBLIC_APP_URL} \
    NEXT_PUBLIC_STORAGE_BASE_URL=${PUBLIC_STORAGE_BASE_URL} \
    NEXT_PUBLIC_IS_CLOUD=false

# Prisma only needs a syntactically valid URL while generating its client.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    pnpm exec turbo run build --filter=web...

FROM node:22-bookworm-slim
WORKDIR /app
ENV COREPACK_HOME=/opt/corepack
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_IS_CLOUD=false \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
COPY --from=build /app /app
USER node
EXPOSE 3000
CMD ["pnpm", "--filter", "web", "start"]
