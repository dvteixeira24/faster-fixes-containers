# Faster Fixes containers

This repository builds [manucoffin/faster-fixes](https://github.com/manucoffin/faster-fixes) into a self-hosted web image, publishes it to GitHub Container Registry (GHCR), and provides a Compose deployment with PostgreSQL. Upstream source is checked out during the build; it is not vendored into this repository.

The web image also runs the one-shot Prisma migration service. The upstream [self-hosting guide](https://www.faster-fixes.com/docs/self-hosting) describes the remaining required services: S3-compatible screenshot storage, Inngest for background jobs, and Resend or Plunk for email. The Compose file does not create these accounts or configure HTTPS.

## Publish an image

1. This project is published at https://github.com/dvteixeira24/faster-fixes-containers. Push changes to `main` to build a new image.
2. In the repository's **Settings → Secrets and variables → Actions → Variables**, set `PUBLIC_APP_URL` to the final HTTPS URL, for example `https://feedback.example.com`, and `PUBLIC_STORAGE_BASE_URL` to the public URL of your screenshot bucket. These values are embedded in the browser bundle during `next build`; changing `.env` later will not change them in an already built image. If the variables are unset, the build defaults to `http://localhost:3000` and an empty storage URL for local testing.
3. Enable GitHub Actions if prompted. The [publish workflow](.github/workflows/publish.yml) builds on pushes to `main`, every Monday, and manual runs. Manual runs accept an upstream branch, tag, or commit. Each successful run publishes `ghcr.io/OWNER/faster-fixes-containers:latest` and `:upstream-<12-character-sha>`.
4. In the package settings on GitHub, make the GHCR package public if GitHub initially creates it as private. A public repository does not always make its packages public automatically.

The workflow uses the repository's `GITHUB_TOKEN`; no personal access token is needed to publish from this repository. Pin `GHCR_IMAGE` to an image digest in production if you want upgrades to happen only when you change the digest. Scheduled builds can fail when upstream changes break the small compatibility patches; the failed job is a signal to review upstream changes.

## Deploy with Compose

Copy `.env.example` to `.env` and fill in the image name, database password, domain, auth secret, storage credentials, Inngest keys, and email API key. Keep `.env` private. Use a long alphanumeric `POSTGRES_PASSWORD`; this Compose file inserts it into a PostgreSQL URL, so URI punctuation would need percent encoding. Generate `BETTER_AUTH_SECRET` with `openssl rand -base64 32`.

```sh
docker compose pull
docker compose up -d
```

Compose starts PostgreSQL, waits for it to become healthy, applies Prisma migrations, and then starts the web app. By default, the app binds only to `127.0.0.1:3000`. Put an HTTPS reverse proxy in front of it and set `DOMAIN_NAME`, `BASE_URL`, and `BETTER_AUTH_URL` in `.env` to match the public host. Configure Inngest to reach `https://YOUR-DOMAIN/api/inngest`. After deployment, visit `/login` and create the first account.

The `NEXT_PUBLIC_FF_API_ORIGIN` and `NEXT_PUBLIC_STORAGE_BASE_URL` values in the image come from the build variables above. For the client-side widget, point it at the same deployed origin. `NEXT_PUBLIC_IS_CLOUD` is fixed to `false` for this self-hosted image.

## Build locally

```sh
git clone https://github.com/manucoffin/faster-fixes.git upstream
docker build \
  --build-arg PUBLIC_APP_URL=http://localhost:3000 \
  --build-arg PUBLIC_STORAGE_BASE_URL=https://your-public-bucket.example.com \
  -t faster-fixes:local .
```

Set `GHCR_IMAGE=faster-fixes:local` in `.env` to use the local image with Compose. The `upstream/` checkout is ignored by Git.

## Upstream changes and licensing

The [patches](patches/) select the standard PostgreSQL adapter for production, disable the cloud billing plugin in self-hosted mode, and defer optional GitHub App credentials until that integration is used. They apply during the Docker build and fail visibly if upstream changes make them incompatible. The image contains the upstream application, which is [AGPL-3.0 licensed](https://github.com/manucoffin/faster-fixes/blob/main/LICENSE). Keep the upstream source and any modifications available when distributing or operating the image, in line with that license.
