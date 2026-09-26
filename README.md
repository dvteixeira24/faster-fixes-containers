# Faster Fixes containers

This repository builds [manucoffin/faster-fixes](https://github.com/manucoffin/faster-fixes) into a self-hosted web image, publishes it to GitHub Container Registry (GHCR), and provides a Compose deployment with PostgreSQL and self-hosted Inngest. The upstream source is tracked as a Git submodule at a pinned commit rather than copied into this repository.

The web container applies pending Prisma migrations before starting the application. The upstream [self-hosting guide](https://www.faster-fixes.com/docs/self-hosting) describes the remaining required services: S3-compatible screenshot storage and transactional email. The current image uses Resend for email. The Compose file does not create external accounts or configure HTTPS.

## Publish an image

1. This project is published at https://github.com/dvteixeira24/faster-fixes-containers. Push changes to `main` to build a new image.
2. In the repository's **Settings → Secrets and variables → Actions → Variables**, set `PUBLIC_APP_URL` to the final HTTPS URL, for example `https://feedback.example.com`, and `PUBLIC_STORAGE_BASE_URL` to the public URL of your screenshot bucket. These values are embedded in the browser bundle during `next build`; changing `.env` later will not change them in an already built image. If `PUBLIC_APP_URL` is unset, the build uses `http://localhost:3000`; set it to the final public URL before publishing an image for deployment. The storage URL remains empty until `PUBLIC_STORAGE_BASE_URL` is set.
3. Enable GitHub Actions if prompted. The [publish workflow](.github/workflows/publish.yml) builds on pushes to `main`, every Monday, and manual runs. Each run builds the upstream commit recorded by this repository and publishes `ghcr.io/OWNER/faster-fixes-containers:latest` and `:upstream-<12-character-sha>`.
4. In the package settings on GitHub, make the GHCR package public if GitHub initially creates it as private. A public repository does not always make its packages public automatically.

The workflow uses the repository's `GITHUB_TOKEN`; no personal access token is needed to publish from this repository. Pin `GHCR_IMAGE` to an image digest in production if you want upgrades to happen only when you change the digest. Updating the upstream submodule pointer may require updating compatibility patches before the image builds successfully. Scheduled builds use the same pinned upstream revision until that pointer changes.

## Deploy with Compose

Copy `.env.example` to `.env` and fill in the image name, database password, domain, auth secret, storage credentials, and Resend API key. Generate independent `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` values with `openssl rand -hex 32`, then put both in `.env`. Keep `.env` private. Use a long alphanumeric `POSTGRES_PASSWORD`; this Compose file inserts it into a PostgreSQL URL, so URI punctuation would need percent encoding. Generate `BETTER_AUTH_SECRET` with `openssl rand -base64 32`.

```sh
docker compose pull
docker compose up -d
```

Compose starts PostgreSQL and the self-hosted Inngest server, then the web container applies pending Prisma migrations before starting Next.js. Migration failure prevents the web server from starting, and already-applied migrations are safely skipped on later restarts. Keeping migration startup inside the long-running web service also avoids leaving a successfully exited init container that stack managers such as Dockge may report as an exited stack.

Inngest syncs `http://web:3000/api/inngest` across the Compose network and polls for updated functions every 60 seconds; no Inngest Cloud account or public Inngest endpoint is needed. Its state is stored in the `inngest_data` volume using the single-node SQLite and embedded Redis defaults described in [Inngest's self-hosting guide](https://www.inngest.com/docs/self-hosting). Back up that volume along with PostgreSQL. For higher reliability or scale, configure dedicated Redis and PostgreSQL for Inngest.

By default, the web app binds only to `127.0.0.1:3000` and the Inngest dashboard/API binds only to `127.0.0.1:8288` on the VPS. Put an HTTPS reverse proxy in front of the web app and set `DOMAIN_NAME`, `BASE_URL`, and `BETTER_AUTH_URL` in `.env` to match the public host. Do not expose the Inngest dashboard to the internet. To view it remotely, use an SSH tunnel such as `ssh -L 8288:127.0.0.1:8288 YOUR-VPS` and open `http://localhost:8288`. After deployment, visit `/login` and create the first account.

The `NEXT_PUBLIC_FF_API_ORIGIN` and `NEXT_PUBLIC_STORAGE_BASE_URL` values in the image come from the build variables above. For the client-side widget, point it at the same deployed origin. `NEXT_PUBLIC_IS_CLOUD` is fixed to `false` for this self-hosted image.

## Build locally

Clone the repository with its pinned upstream source:

```sh
git clone --recurse-submodules https://github.com/dvteixeira24/faster-fixes-containers.git
cd faster-fixes-containers
docker build \
  --build-arg PUBLIC_APP_URL=http://localhost:3000 \
  --build-arg PUBLIC_STORAGE_BASE_URL=https://your-public-bucket.example.com \
  -t faster-fixes:local .
```

For an existing checkout, run `git submodule update --init upstream` before building. Set `GHCR_IMAGE=faster-fixes:local` in `.env` to use the local image with Compose.

## Update upstream

Advance the submodule deliberately, then commit the new pointer in this repository:

```sh
git -C upstream fetch origin
git -C upstream switch --detach origin/main
git add upstream
git commit -m "chore: update upstream submodule"
```

Review the [compatibility patches](patches/) against the new upstream revision before publishing an image.

## Upstream changes and licensing

The [patches](patches/) select the standard PostgreSQL adapter for production, disable the cloud billing plugin in self-hosted mode, and defer optional GitHub App and integration encryption credentials until those integrations are used, and create the email client only when mail is sent. They apply during the Docker build and fail visibly if upstream changes make them incompatible. The image contains the upstream application, which is [AGPL-3.0 licensed](https://github.com/manucoffin/faster-fixes/blob/main/LICENSE). Keep the upstream source and any modifications available when distributing or operating the image, in line with that license.
