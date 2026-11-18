// Operator-only helper. No public route imports this module.
export const CHATGPT_CLIENT_ID = "https://chatgpt.com/oauth/client.json";
export const INTROSPECTION_CLIENT_NAME = "TaskBoard MCP session validation";
export type ClientCredentials = { clientId: string; clientSecret: string };

export async function saveClientEnvironment(credentials: ClientCredentials,
  saveOne: (entry: { key: string; value: string; type: string; visibility: string; target: string[] }) => Promise<void>) {
  // Vercel CLI 53.0.1 serializes only plain JSON objects in Client._fetch.
  // Passing the REST API's supported top-level array through that CLI leaves
  // it unserialized. Keep every request body an individual object instead.
  for (const entry of [
    { key: "MCP_INTROSPECTION_CLIENT_ID", value: credentials.clientId, type: "encrypted", visibility: "config", target: ["production", "preview"] },
    { key: "MCP_INTROSPECTION_CLIENT_SECRET", value: credentials.clientSecret, type: "sensitive", visibility: "secret", target: ["production", "preview"] },
    { key: "MCP_OAUTH_CLIENT_ID", value: CHATGPT_CLIENT_ID, type: "encrypted", visibility: "config", target: ["production", "preview"] },
  ]) await saveOne(entry);
}
export function checkSavedClientEnvironment(envs: { key: string; target?: string[] }[]) {
  for (const key of ["MCP_INTROSPECTION_CLIENT_ID", "MCP_INTROSPECTION_CLIENT_SECRET", "MCP_OAUTH_CLIENT_ID"]) {
    for (const target of ["production", "preview"]) {
      if (!envs.some((entry) => entry.key === key && entry.target?.includes(target))) {
        throw new Error("Vercel client settings were not completely saved. Stop for review.");
      }
    }
  }
}

export function checkResourceEnvironment(envs: { key: string; target?: string[] }[]) {
  const newKeys = ["MCP_INTROSPECTION_CLIENT_ID", "MCP_INTROSPECTION_CLIENT_SECRET", "MCP_OAUTH_CLIENT_ID"];
  if (envs.some((entry) => newKeys.includes(entry.key))) {
    throw new Error("OAuth client settings already exist. Stop for review; no credentials were replaced.");
  }
  for (const key of ["MCP_PUBLIC_RESOURCE", "MCP_OAUTH_ISSUER", "MCP_OAUTH_SUBJECT",
    "MCP_SUPABASE_PUBLISHABLE_KEY", "MCP_SUPABASE_PASSWORD", "MCP_OAUTH_ENABLED"]) {
    for (const target of ["production", "preview"]) {
      if (!envs.some((entry) => entry.key === key && entry.target?.includes(target))) {
        throw new Error(`Missing ${key} in ${target}. No OAuth client was created.`);
      }
    }
  }
}

export async function registerIntrospectionClient(options: {
  handler: (request: Request) => Promise<Response>;
  base: string;
  resource: string;
  email: string;
  password: string;
  subject: string;
  persist: (credentials: ClientCredentials) => Promise<void>;
}) {
  const { handler, base, resource, email, password, subject, persist } = options;
  let cookie = "";
  let clientId = "";
  let saved = false;
  const post = (path: string, body: Record<string, unknown>) => handler(new Request(new URL(path, base), {
    method: "POST", headers: { "content-type": "application/json", origin: new URL(base).origin, cookie },
    body: JSON.stringify(body),
  }));
  try {
    const login = await post("/api/auth/sign-in/email", { email, password, callbackURL: "/" });
    if (login.status !== 200) throw new Error("The dedicated OAuth login could not be verified.");
    cookie = login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    const identity = await login.json() as { user?: { id?: string; email?: string } };
    if (!cookie || identity.user?.id !== subject || identity.user?.email !== email) {
      throw new Error("OAuth login identity does not match the approved subject.");
    }
    const registered = await post("/api/auth/oauth2/create-client", {
      client_name: INTROSPECTION_CLIENT_NAME,
      redirect_uris: [new URL("/oauth-introspection-callback", resource).toString()],
      application_type: new URL(base).protocol === "https:" ? "web" : "native",
      token_endpoint_auth_method: "client_secret_post",
      grant_types: ["authorization_code"], response_types: ["code"], scope: "openid",
    });
    if (registered.status !== 201) throw new Error("Private validation client registration failed.");
    const credentials = await registered.json() as Record<string, unknown>;
    if (typeof credentials.client_id === "string") clientId = credentials.client_id;
    if (!clientId || typeof credentials.client_secret !== "string" || credentials.client_secret.length < 32) {
      throw new Error("Private validation client returned incomplete credentials.");
    }
    const check = await handler(new Request(new URL("/api/auth/oauth2/introspect", base), {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: credentials.client_secret,
        token: "operator-preflight-invalid-token", token_type_hint: "access_token" }),
    }));
    if (check.status !== 200 || (await check.json() as { active?: boolean }).active !== false) {
      throw new Error("Validation client credentials did not pass verification.");
    }
    await persist({ clientId, clientSecret: credentials.client_secret });
    saved = true;
    return { clientId };
  } finally {
    // Only remove the new client from this invocation if saving failed.
    // Never delete or rotate a pre-existing client.
    if (clientId && !saved) {
      const removed = await post("/api/auth/oauth2/delete-client", { client_id: clientId }).catch(() => null);
      if (!removed?.ok) console.error("REVIEW REQUIRED: temporary validation client cleanup could not be confirmed.");
    }
    if (cookie) {
      const ended = await post("/api/auth/sign-out", {}).catch(() => null);
      if (!ended?.ok) console.error("REVIEW REQUIRED: operator session cleanup could not be confirmed.");
    }
  }
}
