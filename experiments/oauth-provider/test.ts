import assert from "node:assert/strict";
import { auth } from "./auth.js";

// Deliberately unauthenticated test. The disposable CI database is migrated,
// but no OAuth user, client, consent, or access token is ever created here.
const base = process.env.OAUTH_TEST_BASE_URL;
if (!base) throw new Error("Missing OAUTH_TEST_BASE_URL");

const response = await auth.handler(
  new Request(new URL("/api/auth/oauth2/authorize", base), { method: "GET" }),
);
if (response.status >= 300 && response.status < 400) {
  const location = response.headers.get("location");
  assert.ok(location, "OAuth redirect must include a location.");
  const redirect = new URL(location, base);
  assert.equal(redirect.origin, new URL(base).origin, "OAuth cannot redirect off-site.");
  assert.ok(
    ["/sign-in", "/api/auth/error"].includes(redirect.pathname),
    `OAuth request redirected to an unexpected path: ${redirect.pathname}`,
  );
  console.log(`PASS: OAuth request safely redirected to local ${redirect.pathname}.`);
} else {
  assert.ok(
    response.status >= 400 && response.status < 500,
    `Unexpected authorization response HTTP ${response.status}`,
  );
  console.log(`PASS: invalid OAuth request rejected with HTTP ${response.status}`);
}
