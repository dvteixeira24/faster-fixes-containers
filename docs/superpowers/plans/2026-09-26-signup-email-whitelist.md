# Signup Email Whitelist Implementation Plan

> Implementation record: sub-agents were stopped at the user's request; the remaining work was completed directly.

**Goal:** Allow self-hosted operators to restrict public signup to exact email addresses while keeping the existing open signup default.

**Architecture:** A shared server helper reads a runtime flag and comma-separated address list. The tRPC signup mutation checks the helper, and the Better Auth HTTP route checks both JSON and form bodies before forwarding. The code ships as a Docker build patch against the pinned `upstream/` submodule; deployment documentation shows how to enable it.

**Tech Stack:** TypeScript, Next.js 16.2.1 Route Handlers, Better Auth 1.5.4, Zod 4, tRPC, Docker, Compose.

---

## File map

- Create `patches/signup-email-whitelist.patch` with the server helper, tRPC guard, and HTTP guard against files in the pinned `upstream/` submodule.
- Modify `Dockerfile` to apply this patch after the existing compatibility patches.
- Modify `.env.example` with a disabled-by-default switch and blank email list.
- Modify `README.md` with configuration and web-container recreation instructions.

## Task 1: Enforce the signup whitelist

**Files:** Create `patches/signup-email-whitelist.patch`; modify `Dockerfile`.

- [x] Add `apps/web/src/server/auth/signup-email-whitelist.ts` through the patch with this content:

```ts
export const SIGNUP_EMAIL_WHITELIST_ERROR =
  "Account creation is not available for this email address.";

export function isSignupEmailWhitelistEnabled(): boolean {
  return (
    process.env.SIGNUP_EMAIL_WHITELIST_ENABLED?.trim().toLowerCase() ===
    "true"
  );
}

export function canSignUpWithEmail(email: string): boolean {
  if (!isSignupEmailWhitelistEnabled()) {
    return true;
  }

  const allowedEmails = new Set(
    (process.env.SIGNUP_EMAIL_WHITELIST ?? "")
      .split(",")
      .map((address) => address.trim().toLowerCase())
      .filter(Boolean),
  );

  return allowedEmails.has(email.trim().toLowerCase());
}
```

- [x] Import `canSignUpWithEmail` and the error constant in `apps/web/src/app/(auth)/signup/_features/signup-form/signup.trpc.mutation.ts`. Immediately after extracting `email` and `password`, before `auth.api.signUpEmail`, add:

```ts
if (!canSignUpWithEmail(email)) {
  throw new TRPCError({
    code: "FORBIDDEN",
    message: SIGNUP_EMAIL_WHITELIST_ERROR,
  });
}
```

The existing catch block rethrows `TRPCError` so the form displays this message. The separate admin create-user mutation does not call this public guard.

- [x] Replace `apps/web/src/app/api/auth/[...all]/route.ts` through the patch with this implementation. It checks only the public email signup path, supports both Better Auth request encodings, rejects duplicate form email fields and unsupported encodings when enabled, and forwards malformed known-format requests to Better Auth for its validation response:

```ts
import { auth } from "@/server/auth";
import {
  canSignUpWithEmail,
  isSignupEmailWhitelistEnabled,
  SIGNUP_EMAIL_WHITELIST_ERROR,
} from "@/server/auth/signup-email-whitelist";
import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";
import { z } from "zod";

type SignupEmailBody =
  | { kind: "email"; email: string }
  | { kind: "invalid" | "ambiguous" | "unsupported" };

async function readSignupEmail(request: Request): Promise<SignupEmailBody> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();

  try {
    if (contentType === "application/json") {
      const body: unknown = await request.clone().json();
      return typeof body === "object" &&
        body !== null &&
        "email" in body &&
        typeof body.email === "string"
        ? { kind: "email", email: body.email }
        : { kind: "invalid" };
    }

    if (
      contentType === "application/x-www-form-urlencoded" ||
      contentType === "multipart/form-data"
    ) {
      const values = (await request.clone().formData()).getAll("email");
      if (values.length > 1) {
        return { kind: "ambiguous" };
      }
      return typeof values[0] === "string"
        ? { kind: "email", email: values[0] }
        : { kind: "invalid" };
    }
  } catch {
    return { kind: "invalid" };
  }

  return { kind: "unsupported" };
}

function signupDenied(): Response {
  return NextResponse.json(
    { message: SIGNUP_EMAIL_WHITELIST_ERROR },
    { status: 403 },
  );
}

const authHandlers = toNextJsHandler(auth);
export const { GET } = authHandlers;

export async function POST(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
  if (
    pathname.endsWith("/sign-up/email") &&
    isSignupEmailWhitelistEnabled()
  ) {
    const body = await readSignupEmail(request);
    if (body.kind === "ambiguous" || body.kind === "unsupported") {
      return signupDenied();
    }
    if (
      body.kind === "email" &&
      z.email().safeParse(body.email).success &&
      !canSignUpWithEmail(body.email)
    ) {
      return signupDenied();
    }
  }

  return authHandlers.POST(request);
}
```

- [x] Keep the existing `Dockerfile` registration after `lazy-mailer.patch` and before `pnpm install`:

```dockerfile
    && patch -p1 < /tmp/patches/signup-email-whitelist.patch \
```

- [x] Run `git -C upstream apply --check --whitespace=error ../patches/signup-email-whitelist.patch` from the parent checkout to verify the patch applies to the pinned submodule without changing it. Expected: exit 0, no output.

## Task 2: Document runtime configuration

**Files:** Modify `.env.example` and `README.md`.

- [x] Add these disabled-by-default values to `.env.example` near the auth settings:

```dotenv
# Public signup stays open unless this is true.
SIGNUP_EMAIL_WHITELIST_ENABLED=false
# Comma-separated exact email addresses used when the flag is true.
SIGNUP_EMAIL_WHITELIST=
```

- [x] Add a README section showing the operator setting `SIGNUP_EMAIL_WHITELIST_ENABLED=true` and `SIGNUP_EMAIL_WHITELIST=admin@example.com,developer@example.com` in `.env`. Explain case-insensitive exact matching, the fail-closed empty list, that existing users can still sign in, and that admins can still create users separately. Show `docker compose up -d --force-recreate web` to load changed `.env` values.

- [x] Inspect the final diff and run `git diff --check`. Confirm the Dockerfile patch order, the submodule's pinned SHA, and both public signup entry points. No tests are added for this patch-based deployment change.

## Acceptance checklist

- With the flag unset or false, public signup behavior is unchanged.
- With the flag true, only listed exact addresses can use the tRPC form or Better Auth's JSON and form HTTP signup routes.
- When enabled, an empty list denies all public signups; ambiguous or unsupported direct request encodings cannot bypass the list.
- Invalid email values are validated by Better Auth; denied valid addresses receive a generic error.
- Admin-created users and sign-in remain available.
- `.env.example`, README, and the Docker patch provide a deployable configuration path.
