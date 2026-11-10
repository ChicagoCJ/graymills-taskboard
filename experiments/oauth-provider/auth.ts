import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { mcp } from "@better-auth/mcp";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { Pool } from "pg";

// Isolated proof-of-concept only. No TaskBoard or production Supabase connection.
// The database and secret must be explicitly supplied by the disposable CI job.
const databaseUrl = process.env.OAUTH_TEST_DATABASE_URL;
const secret = process.env.OAUTH_TEST_SECRET;
const baseURL = process.env.OAUTH_TEST_BASE_URL;
const resource = process.env.OAUTH_TEST_RESOURCE;

if (!databaseUrl || !secret || !baseURL || !resource) {
  throw new Error("Disposable OAuth test environment is incomplete.");
}
const loopbackHosts = new Set(["localhost", "127.0.0.1"]);
const baseUrl = new URL(baseURL);
const postgresUrl = new URL(databaseUrl);
const resourceUrl = new URL(resource);

if (!loopbackHosts.has(baseUrl.hostname) ||
    !loopbackHosts.has(postgresUrl.hostname) ||
    !loopbackHosts.has(resourceUrl.hostname) ||
    !["postgres:", "postgresql:"].includes(postgresUrl.protocol) ||
    decodeURIComponent(postgresUrl.pathname) !== "/oauth_ci") {
  throw new Error("The OAuth prototype accepts only disposable local database and loopback resource URLs.");
}

const pool = new Pool({ connectionString: databaseUrl });

export const auth = betterAuth({
  appName: "TaskBoard OAuth isolated prototype",
  baseURL,
  secret,
  database: pool,
  disabledPaths: ["/token"],
  emailAndPassword: { enabled: false },
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
