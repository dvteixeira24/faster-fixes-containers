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
