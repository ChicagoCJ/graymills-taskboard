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
if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) {
  throw new Error("The OAuth prototype may run only on loopback.");
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
