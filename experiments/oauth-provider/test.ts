import assert from "node:assert/strict";
import { auth, pool } from "./auth.js";
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";

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

// Verify discovery is truthful before any ChatGPT client can connect.
// This request contains no secrets and does not register a client.
const metadataHandler = oauthProviderAuthServerMetadata(auth);
const metadataResponse = await metadataHandler(
  new Request(new URL("/.well-known/oauth-authorization-server/api/auth", base)),
);
assert.equal(metadataResponse.status, 200, "OAuth authorization-server metadata must be available.");
const metadata = await metadataResponse.json() as Record<string, unknown>;
assert.equal(
  metadata.issuer,
  new URL("/api/auth", base).toString(),
  "OAuth metadata must advertise the configured local issuer.",
);
assert.ok(
  typeof metadata.authorization_endpoint === "string",
  "OAuth metadata must advertise its authorization endpoint.",
);
assert.ok(
  typeof metadata.token_endpoint === "string",
  "OAuth metadata must advertise its token endpoint.",
);
assert.equal(
  metadata.registration_endpoint,
  undefined,
  "Unauthenticated dynamic client registration must remain disabled.",
);
console.log("PASS: OAuth discovery advertises local issuer and no public client registration.");

if (process.env.OAUTH_TEST_ENABLE_SIGNUP === "true") {
  // A short-lived, fictitious identity exists only inside GitHub Actions.
  const signupResponse = await auth.handler(
    new Request(new URL("/api/auth/sign-up/email", base), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: new URL(base).origin,
      },
      body: JSON.stringify({
        name: "OAuth CI Test User",
        email: "oauth-ci-user@example.test",
        password: "Only-Disposable-CI-Test-Password-4832!",
      }),
    }),
  );
  assert.equal(signupResponse.status, 200, "Disposable OAuth user sign-up must succeed.");
  const cookie = signupResponse.headers.getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  assert.ok(cookie.includes("session_token"), "Disposable sign-up must create a session.");

  // User-owned OAuth client registration must require this test session.
  const createClientResponse = await auth.handler(
    new Request(new URL("/api/auth/oauth2/create-client", base), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: new URL(base).origin,
        cookie,
      },
      body: JSON.stringify({
        client_name: "Disposable OAuth CI Client",
        redirect_uris: ["http://127.0.0.1:8787/callback"],
        token_endpoint_auth_method: "none",
        application_type: "native",
        scope: "openid profile",
      }),
    }),
  );
  assert.equal(createClientResponse.status, 200, "Session-authorized OAuth client registration must succeed.");
  const client = await createClientResponse.json() as Record<string, unknown>;
  assert.ok(typeof client.client_id === "string", "Client registration must return an ID.");
  assert.ok(!client.client_secret, "Public test client must not receive a secret.");
  console.log("PASS: isolated test user/session and public OAuth client created.");
}

// Close the disposable database connection so the CI process terminates.
await pool.end();
