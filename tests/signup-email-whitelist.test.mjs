import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const patch = fs.readFileSync(
  new URL("../patches/signup-email-whitelist.patch", import.meta.url),
  "utf8",
);
const fileStart = patch.indexOf(
  "+++ b/apps/web/src/server/auth/signup-email-whitelist.ts",
);
assert.notEqual(fileStart, -1, "whitelist module is present in patch");
const contentStart = patch.indexOf("\n", fileStart) + 1;
const nextFile = patch.indexOf("\n--- a/", contentStart);
const addedFileLines = patch
  .slice(contentStart, nextFile === -1 ? undefined : nextFile)
  .split(/\r?\n/)
  .filter((line) => line.startsWith("+"))
  .map((line) => line.slice(1));

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "signup-whitelist-"));
const modulePath = path.join(tempDir, "signup-email-whitelist.ts");
fs.writeFileSync(modulePath, addedFileLines.join("\n"));
const { canSignUpWithEmail } = await import(pathToFileURL(modulePath).href);

const routeStart = patch.indexOf(
  "+++ b/apps/web/src/app/api/auth/[...all]/route.ts",
);
assert.notEqual(routeStart, -1, "auth route is present in patch");
const routeContentStart = patch.indexOf("\n", routeStart) + 1;
const routeAddedLines = patch
  .slice(routeContentStart)
  .split(/\r?\n/)
  .filter((line) => line.startsWith("+"))
  .map((line) => line.slice(1));
const routeSource = routeAddedLines.join("\n").replace(/^import[\s\S]*?;\s*/gm, "");
const routeModulePath = path.join(tempDir, "auth-route.ts");
fs.writeFileSync(
  routeModulePath,
  `
const matcherCalls: string[] = [];
const auth = {};
const isSignupEmailWhitelistEnabled = () => true;
const canSignUpWithEmail = (email: string) => {
  matcherCalls.push(email);
  return false;
};
const SIGNUP_EMAIL_WHITELIST_ERROR = "Signup denied";
const toNextJsHandler = () => ({
  GET: () => new Response(null, { status: 200 }),
  POST: async () => Response.json({ forwarded: true }, { status: 200 }),
});
const NextResponse = {
  json: (body: unknown, init: ResponseInit) => Response.json(body, init),
};
const z = {
  email: () => ({
    safeParse: (value: string) => ({
      success: /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value),
    }),
  }),
};
${routeSource}
export { matcherCalls };
`,
);
const { POST: postAuthRequest, matcherCalls } = await import(
  pathToFileURL(routeModulePath).href
);

const envKeys = [
  "SIGNUP_EMAIL_WHITELIST_ENABLED",
  "SIGNUP_EMAIL_WHITELIST",
];
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));

test.after(() => {
  for (const [key, value] of originalEnv) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function configureWhitelist(value) {
  process.env.SIGNUP_EMAIL_WHITELIST_ENABLED = "true";
  process.env.SIGNUP_EMAIL_WHITELIST = value;
}

test("preserves exact email matching", () => {
  configureWhitelist(" Admin@Example.com ");
  assert.equal(canSignUpWithEmail("admin@example.com"), true);
  assert.equal(canSignUpWithEmail("other@example.com"), false);
});

test("accepts direct-domain wildcard entries", () => {
  configureWhitelist(" *@Provider.com ");
  assert.equal(canSignUpWithEmail("alice@provider.com"), true);
  assert.equal(canSignUpWithEmail("BOB@PROVIDER.COM"), true);
});

test("rejects subdomains for a direct-domain wildcard", () => {
  configureWhitelist("*@provider.com");
  assert.equal(canSignUpWithEmail("alice@mail.provider.com"), false);
});

test("does not interpret partial wildcard entries", () => {
  configureWhitelist("admin*@provider.com");
  assert.equal(canSignUpWithEmail("administrator@provider.com"), false);
});

test("checks padded signup emails against the whitelist before forwarding", async () => {
  matcherCalls.length = 0;
  const response = await postAuthRequest(
    new Request("https://example.test/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: " unauthorized@provider.com " }),
    }),
  );

  assert.equal(response.status, 403);
  assert.deepEqual(matcherCalls, ["unauthorized@provider.com"]);
});

test("forwards invalid signup emails without checking the whitelist", async () => {
  matcherCalls.length = 0;
  const response = await postAuthRequest(
    new Request("https://example.test/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(matcherCalls, []);
});

test("denies unsupported signup content types", async () => {
  matcherCalls.length = 0;
  const response = await postAuthRequest(
    new Request("https://example.test/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "email=unauthorized@provider.com",
    }),
  );

  assert.equal(response.status, 403);
  assert.deepEqual(matcherCalls, []);
});

test("denies signup forms with duplicate email values", async () => {
  matcherCalls.length = 0;
  const response = await postAuthRequest(
    new Request("https://example.test/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body:
        "email=unauthorized%40provider.com&email=another%40provider.com",
    }),
  );

  assert.equal(response.status, 403);
  assert.deepEqual(matcherCalls, []);
});
