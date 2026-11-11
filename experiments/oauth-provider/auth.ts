import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { mcp } from "@better-auth/mcp";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { Pool } from "pg";
import { PostgresDialect } from "kysely";

// The existing CI tests use only a disposable loopback database. The
// deployment branch is separately gated and requires explicit server-only
// credentials. Never load TaskBoard's production Supabase service-role key.
const inCi = Boolean(process.env.OAUTH_TEST_DATABASE_URL);
const databaseUrl = inCi ? process.env.OAUTH_TEST_DATABASE_URL : process.env.OAUTH_DATABASE_URL;
const secret = inCi ? process.env.OAUTH_TEST_SECRET : process.env.OAUTH_SERVER_SECRET;
const baseURL = inCi ? process.env.OAUTH_TEST_BASE_URL : process.env.OAUTH_BASE_URL;
const resource = inCi ? process.env.OAUTH_TEST_RESOURCE : process.env.OAUTH_RESOURCE;

if (!databaseUrl || !secret || !baseURL || !resource) {
  throw new Error("OAuth authentication is disabled until its server-only configuration is complete.");
}
const baseUrl = new URL(baseURL);
const postgresUrl = new URL(databaseUrl);
const resourceUrl = new URL(resource);
const loopbackHosts = new Set(["localhost", "127.0.0.1"]);

if (inCi) {
  if (!loopbackHosts.has(baseUrl.hostname) ||
      !loopbackHosts.has(postgresUrl.hostname) ||
      !loopbackHosts.has(resourceUrl.hostname) ||
      decodeURIComponent(postgresUrl.pathname) !== "/oauth_ci") {
    throw new Error("OAuth CI tests accept only disposable local database and resource URLs.");
  }
} else {
  if (process.env.OAUTH_DEPLOY_ENABLED !== "true" ||
      baseUrl.protocol !== "https:" ||
      resourceUrl.protocol !== "https:" ||
      !["postgres:", "postgresql:"].includes(postgresUrl.protocol) ||
      postgresUrl.hostname !== process.env.OAUTH_ALLOWED_DB_HOST ||
      !/^chatgpt_oauth_runtime(?:\.[a-z0-9]+)?$/.test(decodeURIComponent(postgresUrl.username)) ||
      baseUrl.hostname !== process.env.OAUTH_ALLOWED_HOST ||
      baseUrl.pathname !== "/" ||
      secret.length < 32) {
    throw new Error("The isolated OAuth server is not authorized for this deployment.");
  }
}

export const pool = new Pool({ connectionString: databaseUrl });

export const auth = betterAuth({
  appName: "TaskBoard OAuth isolated prototype",
  baseURL,
  secret,
  database: {
    dialect: new PostgresDialect({ pool }),
    type: "postgres",
    schemaName: "chatgpt_oauth",
  },
  disabledPaths: ["/token"],
  // Test accounts can be created only when explicitly enabled by the
  // disposable CI job. Never deploy this prototype to a public hostname.
  emailAndPassword: {
    enabled: true,
    disableSignUp: !inCi || process.env.OAUTH_TEST_ENABLE_SIGNUP !== "true",
  },
  plugins: [
    jwt({ disableSettingJwtHeader: true }),
    mcp({
      loginPage: "/sign-in",
      consentPage: "/consent",
      resource,
    }),
    cimd({
      fetchClientMetadataResource,
      metadataProfile: "mcp-2026-07-28",
    }),
  ],
});
