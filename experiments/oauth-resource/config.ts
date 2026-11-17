export const MCP_PATH = "/api/integrations/chatgpt/mcp";
export const METADATA_PATH = "/.well-known/oauth-protected-resource" + MCP_PATH;
export const PROJECT_ID = "22eacfd8-22f8-4c01-a51d-44987facad42";
export const USER_ID = "90550275-5ffc-434f-bc46-41026ca7ba26";
export const INTEGRATION_MARKER = "graymills_seo_readonly_v1";
export const SUPABASE_ORIGIN = "https://sxwwxeyclbduovrlvtxx.supabase.co";

export type Config = {
  resource: string;
  issuer: string;
  clientId: string;
  subject: string;
  introspectionClientId: string;
  introspectionSecret: string;
  publishableKey: string;
  password: string;
};

export type Environment = Record<string, string | undefined>;

function required(env: Environment, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error("Connector configuration is incomplete.");
  return value;
}

// No live credentials or requests are loaded at module import/build time.
export function readConfig(request: Request, env: Environment = process.env): Config | null {
  if (env.MCP_OAUTH_ENABLED !== "true") return null;
  const resource = required(env, "MCP_PUBLIC_RESOURCE");
  const issuer = required(env, "MCP_OAUTH_ISSUER");
  const resourceUrl = new URL(resource);
  const issuerUrl = new URL(issuer);
  const cleanHttps = (url: URL) => url.protocol === "https:" &&
    !url.username && !url.password && !url.port && !url.search && !url.hash;
  if (!cleanHttps(resourceUrl) || !cleanHttps(issuerUrl) ||
      resourceUrl.pathname !== MCP_PATH || issuerUrl.pathname !== "/api/auth" ||
      resourceUrl.origin === issuerUrl.origin ||
      resource !== resourceUrl.toString() || issuer !== issuerUrl.toString() ||
      new URL(request.url).origin !== resourceUrl.origin) {
    throw new Error("Connector origins are not approved.");
  }
  const publishableKey = required(env, "MCP_SUPABASE_PUBLISHABLE_KEY");
  if (!publishableKey.startsWith("sb_publishable_")) {
    throw new Error("A Supabase publishable key is required.");
  }
  return {
    resource, issuer, publishableKey,
    clientId: required(env, "MCP_OAUTH_CLIENT_ID"),
    subject: required(env, "MCP_OAUTH_SUBJECT"),
    introspectionClientId: required(env, "MCP_INTROSPECTION_CLIENT_ID"),
    introspectionSecret: required(env, "MCP_INTROSPECTION_CLIENT_SECRET"),
    // Preserve intentional whitespace in the password.
    password: env.MCP_SUPABASE_PASSWORD || required(env, "MCP_SUPABASE_PASSWORD"),
  };
}
