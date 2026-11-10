import assert from "node:assert/strict";
import { auth } from "./auth.js";

// A deliberately unauthenticated smoke test. This never creates OAuth users,
// clients, sessions, secrets, or grants and never touches TaskBoard data.
const base = process.env.OAUTH_TEST_BASE_URL;
if (!base) throw new Error("Missing OAUTH_TEST_BASE_URL");

const response = await auth.handler(
  new Request(new URL("/api/auth/oauth2/authorize", base), {
    method: "GET",
  }),
);
assert.ok(
  response.status >= 400 && response.status < 500,
  `Unauthenticated invalid authorization request should fail with 4xx, got ${response.status}`,
);
console.log(`PASS: unconfigured authorization request rejected: HTTP ${response.status}`);
