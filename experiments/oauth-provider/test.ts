import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createLocalJWKSet, jwtVerify } from "jose";
import { verifyResourceToken } from "./verify-resource-token.js";
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
  assert.equal(createClientResponse.status, 201, "Session-authorized OAuth client registration must succeed.");
  const client = await createClientResponse.json() as Record<string, unknown>;
  assert.ok(typeof client.client_id === "string", "Client registration must return an ID.");
  assert.ok(!client.client_secret, "Public test client must not receive a secret.");
  console.log("PASS: isolated test user/session and public OAuth client created.");
  // A public OAuth client must use PKCE; the next step should be consent,
  // never an unprompted authorization-code response to an unrelated host.
  const resource = process.env.OAUTH_TEST_RESOURCE;
  assert.ok(resource, "Missing local OAuth resource.");
  const verifier = "CI-only-deterministic-PKCE-verifier-4832-abcdefgh";
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: String(client.client_id),
    redirect_uri: "http://127.0.0.1:8787/callback",
    scope: "openid profile",
    state: "ci-test-oauth-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource,
  });
  const authorizeResponse = await auth.handler(
    new Request(new URL(`/api/auth/oauth2/authorize?${params}`, base), {
      headers: { cookie },
    }),
  );
  assert.equal(authorizeResponse.status, 302, "Valid OAuth authorization must redirect to consent.");
  const authorizationLocation = authorizeResponse.headers.get("location");
  assert.ok(authorizationLocation, "OAuth authorization must supply its next URL.");
  const next = new URL(authorizationLocation, base);
  assert.equal(next.origin, new URL(base).origin, "Authorization must stay on local test issuer.");
  assert.equal(next.pathname, "/consent", "Valid authorization should require consent.");
  console.log("PASS: PKCE authorization request enters local consent flow.");
  // Consent must preserve the signed authorization query. Do not log codes
  // or tokens, even though the database and identity are disposable.
  const signedParamNames = new Set(["sig", "ba_param", ...next.searchParams.getAll("ba_param")]);
  const signedQuery = new URLSearchParams(
    [...next.searchParams].filter(([key]) => signedParamNames.has(key)),
  ).toString();
  const consentResponse = await auth.handler(
    new Request(new URL("/api/auth/oauth2/consent", base), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: new URL(base).origin,
        cookie,
      },
      body: JSON.stringify({ accept: true, oauth_query: signedQuery }),
    }),
  );
  assert.equal(consentResponse.status, 200, "Signed OAuth consent should succeed.");
  const consent = await consentResponse.json() as Record<string, unknown>;
  assert.equal(consent.redirect, true, "Consent should continue the authorization flow.");
  assert.equal(typeof consent.url, "string", "Consent should yield a callback URL.");
  const callbackUrl = new URL(String(consent.url));
  assert.equal(callbackUrl.origin, "http://127.0.0.1:8787", "Code must target registered callback.");
  assert.equal(callbackUrl.pathname, "/callback", "Code must target exact callback path.");
  assert.equal(callbackUrl.searchParams.get("state"), "ci-test-oauth-state");
  const code = callbackUrl.searchParams.get("code");
  assert.ok(code, "User consent must issue a temporary authorization code.");
  console.log("PASS: signed consent issued code for registered callback.");

  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: String(client.client_id),
    redirect_uri: "http://127.0.0.1:8787/callback",
    code_verifier: verifier,
    resource,
  });
  const tokenResponse = await auth.handler(
    new Request(new URL("/api/auth/oauth2/token", base), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    }),
  );
  assert.equal(tokenResponse.status, 200, "PKCE token exchange should succeed.");
  const tokenResult = await tokenResponse.json() as Record<string, unknown>;
  assert.equal(typeof tokenResult.access_token, "string", "Token response must contain access token.");
  const jwtParts = String(tokenResult.access_token).split(".");
  assert.equal(jwtParts.length, 3, "Resource-bound OAuth access token must be a JWT.");
  const claims = JSON.parse(Buffer.from(jwtParts[1], "base64url").toString("utf8")) as Record<string, unknown>;
  const audiences = typeof claims.aud === "string"
    ? [claims.aud]
    : Array.isArray(claims.aud) ? claims.aud : [];
  assert.ok(audiences.includes(resource), "Token must be bound to the exact MCP resource.");
  assert.equal(claims.iss, new URL("/api/auth", base).toString(), "OAuth issuer must match local server.");
  assert.ok(
    claims.client_id === client.client_id || claims.azp === client.client_id,
    "Access token must identify the authorized OAuth client.",
  );
  console.log("PASS: PKCE token issuance bound to local issuer, client and MCP resource.");
  // Unlike the preceding claim inspection, this verifies the token
  // cryptographically against the actual published authorization-server keys.
  const keysResponse = await auth.handler(new Request(new URL("/api/auth/jwks", base)));
  assert.equal(keysResponse.status, 200, "Issuer must publish its signing keys.");
  const keys = await keysResponse.json() as { keys: Array<Record<string, unknown>> };
  assert.ok(Array.isArray(keys.keys) && keys.keys.length > 0, "JWKS must contain a signing key.");
  const keySet = createLocalJWKSet(keys as Parameters<typeof createLocalJWKSet>[0]);
  const expectedIssuer = new URL("/api/auth", base).toString();
  const verified = await jwtVerify(String(tokenResult.access_token), keySet, {
    issuer: expectedIssuer,
    audience: resource,
  });
  assert.equal(verified.payload.sub, claims.sub, "Verified identity must match the issued token.");
  console.log("PASS: published JWKS signature, issuer and intended audience verified.");

  await assert.rejects(
    jwtVerify(String(tokenResult.access_token), keySet, {
      issuer: expectedIssuer,
      audience: "http://127.0.0.1:3000/another-private-resource",
    }),
    "OAuth token must be rejected for a different resource.",
  );
  const tokenParts = String(tokenResult.access_token).split(".");
  const tamperedPayload = Buffer.from(
    JSON.stringify({ ...claims, sub: "injected-user" }),
  ).toString("base64url");
  await assert.rejects(
    jwtVerify([tokenParts[0], tamperedPayload, tokenParts[2]].join("."), keySet, {
      issuer: expectedIssuer,
      audience: resource,
    }),
    "A modified OAuth token must fail signature verification.",
  );
  console.log("PASS: tampered tokens and wrong-audience tokens are rejected.");
  assert.equal(typeof claims.sub, "string", "Access token must identify a user.");
  const options = {
    token: String(tokenResult.access_token),
    jwks: keys as Parameters<typeof verifyResourceToken>[0]["jwks"],
    issuer: expectedIssuer,
    resource,
    clientId: String(client.client_id),
    subject: String(claims.sub),
  };
  const validated = await verifyResourceToken(options);
  assert.equal(validated.sub, claims.sub);
  await assert.rejects(
    verifyResourceToken({ ...options, clientId: "different-client" }),
    "Resource verifier must reject the wrong OAuth client.",
  );
  await assert.rejects(
    verifyResourceToken({ ...options, subject: "wrong-user" }),
    "Resource verifier must reject the wrong integration identity.",
  );
  await assert.rejects(
    verifyResourceToken({ ...options, resource: "http://127.0.0.1:3000/other-mcp" }),
    "Resource verifier must reject the wrong resource.",
  );
  await assert.rejects(
    verifyResourceToken({ ...options, issuer: "http://127.0.0.1:3030/incorrect-issuer" }),
    "Resource verifier must reject the wrong authorization issuer.",
  );
  await assert.rejects(
    verifyResourceToken({ ...options, token: [tokenParts[0], tamperedPayload, tokenParts[2]].join(".") }),
    "Resource verifier must reject a tampered signature.",
  );
  console.log("PASS: strict MCP verifier rejects wrong client, identity, issuer, audience and tampering.");




}

// Close the disposable database connection so the CI process terminates.
await pool.end();
