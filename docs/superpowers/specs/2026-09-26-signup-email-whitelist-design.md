# Signup Email Whitelist Design

**Status:** Approved by the user on 2026-09-26.

## Goal

Allow a self-hosted deployment to restrict public account creation to an explicit list of email addresses, while preserving the current open signup behavior by default.

## Chosen approach

Configure the whitelist with two runtime environment variables passed to the web container through its existing `.env` file:

- `SIGNUP_EMAIL_WHITELIST_ENABLED` defaults to `false`.
- `SIGNUP_EMAIL_WHITELIST` is a comma-separated list of exact email addresses.

When enabled, the server trims entries and compares email addresses case-insensitively. An enabled empty list rejects all public signups. Changes take effect after the web container restarts.

## Enforcement and user behavior

Enforce the policy at both public signup entry points: the tRPC signup mutation used by the application form and Better Auth's direct `/api/auth/sign-up/email` endpoint. A rejected signup gets a generic account-creation error that does not disclose which email addresses are on the list. The public signup form remains available, including when the whitelist is enabled.

Admin-created accounts use a separate flow and remain unaffected. Authentication, existing accounts, sign-in, and email verification behavior do not change.

## Deployment documentation

Add both variables to `.env.example` and explain how to enable the whitelist, format the comma-separated list, restart the service, and retain public signups by leaving the flag disabled in `README.md`.

## Acceptance criteria

1. With the flag unset or `false`, public signup accepts any otherwise valid email, as it does today.
2. With the flag `true`, public signup accepts only listed exact email addresses, ignoring case and surrounding whitespace.
3. Both public signup entry points enforce the same policy; a direct Better Auth request cannot bypass it.
4. An enabled empty list rejects every public signup.
5. Admin-created accounts and sign-in remain available regardless of the whitelist.
6. The deployed image receives the feature through a Docker build-time patch, and the example configuration and deployment guide describe its runtime settings.
