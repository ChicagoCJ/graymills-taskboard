// Run locally with masked PowerShell prompts. No signup endpoint is enabled.
import { Client } from "pg";
import { hostedOperatorDatabaseUrl, OperatorSetupError, prepareOperatorLogin } from "./operator-login.mjs";

let client;
let result;
try {
  const raw = process.env.OAUTH_OPERATOR_DATABASE_URL;
  const password = process.env.OAUTH_OPERATOR_PASSWORD;
  delete process.env.OAUTH_OPERATOR_DATABASE_URL;
  delete process.env.OAUTH_OPERATOR_PASSWORD;
  const connectionString = hostedOperatorDatabaseUrl(raw,
    process.env.OAUTH_OPERATOR_EXPECTED_HOST, process.env.OAUTH_OPERATOR_EXPECTED_PROJECT_REF);
  client = new Client({ connectionString, connectionTimeoutMillis: 10000,
    query_timeout: 15000, statement_timeout: 10000, application_name: "oauth-operator-setup" });
  await client.connect();
  await client.query("begin");
  result = await prepareOperatorLogin(client, { email: process.env.OAUTH_OPERATOR_EMAIL, password });
  await client.query("commit");
} catch (error) {
  if (client) await client.query("rollback").catch(() => {});
  // Never print pg errors, SQL parameters, a URL, password or hash.
  console.error("SETUP STOPPED:", error instanceof OperatorSetupError ? error.message :
    "Database or credential verification failed. No login changes were committed.");
  if (!(error instanceof OperatorSetupError) && /^[A-Z0-9_]{1,50}$/.test(error?.code ?? "")) {
    console.error("Failure code:", error.code);
  }
  process.exitCode = 1;
} finally {
  if (client) await client.end().catch(() => {});
}
if (result && !process.exitCode) {
  console.log(result.created ? "PASS: Dedicated OAuth login created." : "PASS: Existing dedicated OAuth login verified.");
  console.log("OAuth subject:", result.id);
  console.log("This setup does not enable OAuth or public signup, or change TaskBoard users.");
}
