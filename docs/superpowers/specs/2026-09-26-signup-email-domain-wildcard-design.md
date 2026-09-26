# Signup Email Domain Wildcard Design

## Goal

Extend the existing public-signup email whitelist so a deployment can allow every address at one domain without listing each address individually.

## Configuration syntax

`SIGNUP_EMAIL_WHITELIST` remains a comma-separated list. Each entry is one of:

- An exact email address, such as `admin@example.com`.
- A direct-domain wildcard in the exact form `*@example.com`.

Matching ignores letter case and surrounding whitespace. Existing exact-address entries keep their current behavior. Other uses of `*`, such as `admin*@example.com`, have no wildcard meaning and are treated as literal entries.

## Matching behavior

When the whitelist is enabled, the server normalizes the candidate email and each configured entry. An exact entry must equal the complete candidate address. A `*@domain` entry matches when the candidate's complete domain equals `domain`.

The wildcard does not include subdomains. For example, `person@example.com` matches `*@example.com`, while `person@mail.example.com` does not.

The existing behavior remains unchanged when the feature flag is disabled or when an enabled whitelist is empty. Both public signup entry points continue to call the shared matcher, so they enforce identical rules. Admin-created accounts and sign-in remain unaffected.

## Documentation

Update `.env.example` and `README.md` to describe both supported entry types and show a configuration that mixes an exact address with a domain wildcard.

## Verification

Focused checks must demonstrate that:

1. Exact email entries still match and non-listed addresses do not.
2. `*@example.com` accepts a direct address at `example.com`.
3. Domain wildcard matching ignores case and surrounding configuration whitespace.
4. `*@example.com` rejects addresses at subdomains such as `mail.example.com`.
5. Partial wildcard patterns do not gain wildcard behavior.
6. The patch still applies cleanly to the pinned upstream source and the patched application passes its relevant static checks.
