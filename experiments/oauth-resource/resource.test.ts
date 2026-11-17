import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { handleMetadata, handleResource } from "./resource";
import { INTEGRATION_MARKER, MCP_PATH, METADATA_PATH, PROJECT_ID, SUPABASE_ORIGIN, USER_ID } from "./config";

// Every network call is intercepted. All keys and credentials are synthetic.
const RESOURCE = "https://resource.example.test" + MCP_PATH;
const ISSUER = "https://issuer.example.test/api/auth";
const TASK = "640941f3-bab6-414c-b50f-294f61526aea";
const OTHER_TASK = "069f5075-2895-44d6-a603-0cd9aac4fc1f";
const env = {
  MCP_OAUTH_ENABLED: "true", MCP_PUBLIC_RESOURCE: RESOURCE,
  MCP_OAUTH_ISSUER: ISSUER, MCP_OAUTH_CLIENT_ID: "approved-client",
  MCP_OAUTH_SUBJECT: "separate-oauth-subject",
  MCP_INTROSPECTION_CLIENT_ID: "resource-client",
  MCP_INTROSPECTION_CLIENT_SECRET: "synthetic-introspection-secret",
  MCP_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only",
  MCP_SUPABASE_PASSWORD: "synthetic-supabase-password",
};
const { publicKey, privateKey } = await generateKeyPair("RS256");
const getKey = createLocalJWKSet({ keys: [await exportJWK(publicKey)] });
const now = Math.floor(Date.now() / 1000);
const baseClaims = {
  iss: ISSUER, aud: RESOURCE, sub: env.MCP_OAUTH_SUBJECT,
  client_id: env.MCP_OAUTH_CLIENT_ID, scope: "openid profile", sid: "synthetic-session",
  iat: now, exp: now + 240,
};
const sign = (overrides: JWTPayload = {}, typ = "at+jwt") => new SignJWT({ ...baseClaims, ...overrides })
  .setProtectedHeader({ alg: "RS256", typ }).sign(privateKey);
const token = await sign();

function fixture(options: {
  active?: boolean; introspectionStatus?: number; introspectionClaims?: Record<string, unknown>; marker?: string;
  role?: string; userId?: string; projectId?: string; taskProjectId?: string;
} = {}) {
  const calls: { url: URL; method: string }[] = [];
  const requestFetch: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    calls.push({ url, method });
    assert.equal(init.redirect, "error");
    assert.equal(init.cache, "no-store");
    const reply = (body: unknown, status = 200) => Response.json(body, { status });
    if (url.href === ISSUER + "/oauth2/introspect") {
      assert.equal(method, "POST");
      const body = new URLSearchParams(String(init.body));
      assert.equal(body.get("client_id"), env.MCP_INTROSPECTION_CLIENT_ID);
      assert.equal(body.get("client_secret"), env.MCP_INTROSPECTION_CLIENT_SECRET);
      assert.equal(body.get("token"), token);
      return reply({ ...baseClaims, active: options.active ?? true, ...options.introspectionClaims }, options.introspectionStatus ?? 200);
    }
    assert.equal(url.origin, SUPABASE_ORIGIN, "Never send credentials to another origin.");
    const headers = new Headers(init.headers);
    assert.equal(headers.get("apikey"), env.MCP_SUPABASE_PUBLISHABLE_KEY);
    if (url.pathname === "/auth/v1/token") {
      assert.equal(method, "POST");
      assert.equal(url.searchParams.get("grant_type"), "password");
      assert.deepEqual(JSON.parse(String(init.body)), {
        email: "sales@graymills.com", password: env.MCP_SUPABASE_PASSWORD,
      });
      return reply({ access_token: "synthetic-rls-token", refresh_token: "never-return-this" });
    }
    assert.equal(method, "GET", "Supabase data calls must be reads.");
    assert.equal(headers.get("authorization"), "Bearer synthetic-rls-token");
    if (url.pathname === "/auth/v1/user") return reply({
      id: options.userId ?? USER_ID,
      app_metadata: { taskboard_integration: options.marker ?? INTEGRATION_MARKER },
    });
    if (url.pathname === "/rest/v1/profiles") {
      assert.equal(url.searchParams.get("id"), `eq.${USER_ID}`);
      return reply([{ id: USER_ID, role: options.role ?? "member", is_active: true }]);
    }
    if (url.pathname === "/rest/v1/projects") {
      assert.equal(url.searchParams.get("id"), `eq.${PROJECT_ID}`);
      assert.equal(url.searchParams.get("is_active"), "eq.true");
      return reply([{ id: options.projectId ?? PROJECT_ID, name: "Parts Washers — SEO & AI Search",
        is_active: true, secret: "omit-extra-project-field" }]);
    }
    if (url.pathname === "/rest/v1/tasks") {
      assert.equal(url.searchParams.get("project_id"), `eq.${PROJECT_ID}`);
      assert.equal(url.searchParams.get("is_archived"), "eq.false");
      assert.ok(["1", "100"].includes(url.searchParams.get("limit")!));
      if (url.searchParams.get("id") === `eq.${OTHER_TASK}`) return reply([]);
      return reply([{ id: TASK, project_id: options.taskProjectId ?? PROJECT_ID,
        title: "Synthetic SEO task", is_archived: false, secret: "omit-extra-task-field" }]);
    }
    throw new Error("Unexpected network request.");
  };
  return { calls, dependencies: { env, requestFetch, verifyKey: getKey } };
}
function request(method: string, accessToken: string | null, body?: unknown, extra = {}) {
  return new Request(RESOURCE, {
    method,
    headers: { accept: "application/json, text/event-stream", "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}), ...extra },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function unpack(response: Response) {
  const text = await response.text();
  if (text.trimStart().startsWith("{")) return JSON.parse(text);
  const line = text.split(/\r?\n/).find(line => line.startsWith("data:"));
  assert.ok(line, "MCP must return JSON or a message event.");
  return JSON.parse(line.slice(5).trim());
}
const rpc = (method: string, params = {}) => ({ jsonrpc: "2.0", id: 1, method, params });

test("disabled/incomplete/mismatched deployments stay closed without network calls", async () => {
  const f = fixture();
  for (const changed of [{ MCP_OAUTH_ENABLED: "false" }, { MCP_SUPABASE_PASSWORD: "" },
    { MCP_PUBLIC_RESOURCE: "https://wrong.example.test" + MCP_PATH },
    { MCP_OAUTH_ISSUER: "https://resource.example.test/api/auth" },
    { MCP_SUPABASE_PUBLISHABLE_KEY: "sb_secret_not_allowed" }]) {
    const dependencies = { ...f.dependencies, env: { ...env, ...changed } };
    assert.equal((await handleResource(request("POST", token, rpc("tools/list")), dependencies)).status, 503);
    assert.equal((await handleMetadata(new Request("https://resource.example.test" + METADATA_PATH), dependencies)).status, 503);
  }
  assert.equal(f.calls.length, 0);
});

test("discovery contains only approved resource metadata, never credentials", async () => {
  const f = fixture();
  const response = await handleMetadata(new Request("https://resource.example.test" + METADATA_PATH), f.dependencies);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { resource: RESOURCE, authorization_servers: [ISSUER],
    bearer_methods_supported: ["header"], scopes_supported: ["openid"] });
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.equal(f.calls.length, 0);
});

test("cookie-only and cross-origin calls are rejected before verification or data access", async () => {
  const f = fixture();
  const cookie = await handleResource(request("POST", null, rpc("tools/list"), { cookie: "session=irrelevant" }), f.dependencies);
  assert.equal(cookie.status, 401);
  assert.match(cookie.headers.get("www-authenticate")!, /oauth-protected-resource/);
  assert.equal((await handleResource(request("POST", token, rpc("tools/list"), { origin: "https://other.example.test" }), f.dependencies)).status, 403);
  assert.equal(f.calls.length, 0);
});

test("invalid JWTs fail before any network or Supabase credential use", async () => {
  const variants = [
    "ordinary-supabase-session", await sign({ iss: "https://wrong.example.test" }),
    await sign({ aud: "https://wrong.example.test" }), await sign({ sub: "other-user" }),
    await sign({ client_id: "other-client" }), await sign({ azp: "conflicting-client" }),
    await sign({ exp: now - 1 }), await sign({ iat: now + 120 }),
    await sign({ exp: now + 3600 }), await sign({ sid: "" }),
    await sign({ scope: "profile" }), await sign({ cnf: { jkt: "bound-key" } }),
    await sign({}, "JWT"), token.slice(0, -12) + "invalid-signature",
  ];
  for (const badToken of variants) {
    const f = fixture();
    assert.equal((await handleResource(request("POST", badToken, rpc("tools/list")), f.dependencies)).status, 401);
    assert.equal(f.calls.length, 0);
  }
});

test("inactive sessions and unavailable introspection never reach Supabase", async () => {
  for (const [options, status] of [[{ active: false }, 401], [{ introspectionStatus: 503 }, 503]] as const) {
    const f = fixture(options);
    assert.equal((await handleResource(request("POST", token, rpc("tools/list")), f.dependencies)).status, status);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].url.href, ISSUER + "/oauth2/introspect");
  }
});

test("introspection must confirm the same issuer, resource, client, identity, session and expiry", async () => {
  for (const changed of [{ sub: "other-user" }, { iss: "other-issuer" },
    { aud: "other-resource" }, { client_id: "other-client" }, { sid: "other-session" },
    { exp: now + 3600 }, { scope: "profile" }, { active: "true" }]) {
    const f = fixture({ introspectionClaims: changed });
    assert.equal((await handleResource(request("POST", token, rpc("tools/list")), f.dependencies)).status, 401);
    assert.equal(f.calls.length, 1, "Supabase credentials must not be used.");
  }
});

test("valid OAuth initializes and exposes exactly three read tools without opening a data session", async () => {
  const f = fixture();
  const init = await unpack(await handleResource(request("POST", token, rpc("initialize", {
    protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "synthetic-test", version: "1" },
  })), f.dependencies));
  assert.equal(init.result.serverInfo.version, "3.19.0");
  const response = await handleResource(request("POST", token, rpc("tools/list")), f.dependencies);
  assert.equal(response.status, 200);
  const data = await unpack(response);
  assert.deepEqual(data.result.tools.map((tool: { name: string }) => tool.name).sort(),
    ["seo_project", "seo_task", "seo_tasks"]);
  for (const tool of data.result.tools) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
    assert.deepEqual(tool._meta.securitySchemes, [{ type: "oauth2", scopes: ["openid"] }]);
  }
  assert.equal(f.calls.length, 2);
});

test("OAuth task read uses only marked Member RLS; returned data contains no credentials or extra fields", async () => {
  const f = fixture();
  const response = await handleResource(request("POST", token, rpc("tools/call", {
    name: "seo_tasks", arguments: {},
  })), f.dependencies);
  const data = await unpack(response);
  assert.ok(!data.result.isError);
  const payload = JSON.parse(data.result.content[0].text);
  assert.equal(payload.project.id, PROJECT_ID);
  assert.equal(payload.tasks[0].id, TASK);
  const serialized = JSON.stringify(data);
  for (const secret of [token, "synthetic-rls-token", "never-return-this",
    env.MCP_SUPABASE_PASSWORD, env.MCP_INTROSPECTION_CLIENT_SECRET,
    "omit-extra-project-field", "omit-extra-task-field"]) assert.ok(!serialized.includes(secret));
  assert.equal(f.calls.length, 6);
});

test("cross-project task ID is rejected and caller cannot supply a project selector", async () => {
  const f = fixture();
  const data = await unpack(await handleResource(request("POST", token, rpc("tools/call", {
    name: "seo_task", arguments: { taskId: OTHER_TASK },
  })), f.dependencies));
  assert.equal(data.result.isError, true);
  assert.equal(data.result.content[0].text, "Task not found or not visible.");
  const extra = fixture();
  const invalid = await unpack(await handleResource(request("POST", token, rpc("tools/call", {
    name: "seo_tasks", arguments: { projectId: "unapproved-project" },
  })), extra.dependencies));
  assert.ok(invalid.error || invalid.result?.isError);
  assert.equal(extra.calls.length, 1, "Only introspection may run for invalid tool input.");
});

test("wrong Supabase identity, missing marker, elevated role and out-of-scope data all fail closed", async () => {
  for (const options of [{ userId: "another-user" }, { marker: "" }, { role: "admin" },
    { projectId: "another-project" }, { taskProjectId: "another-project" }]) {
    const f = fixture(options);
    const data = await unpack(await handleResource(request("POST", token, rpc("tools/call", {
      name: "seo_tasks", arguments: {},
    })), f.dependencies));
    assert.equal(data.result.isError, true);
    assert.equal(data.result.content[0].text, "Restricted SEO data is unavailable.");
  }
});

test("no write tools or state-changing MCP HTTP methods are available", async () => {
  const f = fixture();
  const data = await unpack(await handleResource(request("POST", token, rpc("tools/call", {
    name: "create_task", arguments: {},
  })), f.dependencies));
  assert.ok(data.error || data.result?.isError);
  for (const method of ["GET", "DELETE"]) {
    assert.equal((await handleResource(request(method, token), f.dependencies)).status, 405);
  }
  assert.ok(f.calls.every(call => call.url.href === ISSUER + "/oauth2/introspect"));
});
