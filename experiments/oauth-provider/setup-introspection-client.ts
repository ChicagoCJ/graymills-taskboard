import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { hostedOperatorDatabaseUrl } from "./operator-login.mjs";
import { CHATGPT_CLIENT_ID, INTROSPECTION_CLIENT_NAME, checkResourceEnvironment, checkSavedClientEnvironment, registerIntrospectionClient } from "./introspection-client-setup";
import { VERCEL_STEPS, safeVercelFailure, type VercelStep } from "./vercel-cli-diagnostics";

// Input is provided by masked PowerShell prompts, never command arguments.
const env = process.env;
let pool: { end: () => Promise<void> } | undefined;
try {
  const project = env.OAUTH_SETUP_VERCEL_PROJECT ?? "";
  const team = env.OAUTH_SETUP_VERCEL_TEAM ?? "";
  const scope = env.OAUTH_SETUP_VERCEL_SCOPE ?? "";
  if (!/^prj_[A-Za-z0-9]+$/.test(project) || !/^team_[A-Za-z0-9]+$/.test(team) ||
      !/^[a-z0-9-]+$/.test(scope) || env.OAUTH_TEST_DATABASE_URL) throw new Error("Invalid operator target.");

  async function vercel(step: VercelStep, path: string, body?: unknown): Promise<Record<string, unknown>> {
    console.log(`CHECK: Vercel ${VERCEL_STEPS[step]}.`);
    const args = ["api", `${path}?teamId=${team}`, "--raw", "--scope", scope];
    if (body !== undefined) args.push("--method", "POST", "--input", "-");
    if (!args.every((value) => /^[A-Za-z0-9_:/?.=-]+$/.test(value))) throw new Error("Invalid CLI request.");
    return new Promise((resolve, reject) => {
      const command = process.platform === "win32" ? "cmd.exe" : "vercel";
      const argv = process.platform === "win32" ? ["/d", "/s", "/c", ["vercel.cmd", ...args].join(" ")] : args;
      const cliEnv: NodeJS.ProcessEnv = { ...process.env };
      for (const key of Object.keys(cliEnv)) if (key.startsWith("OAUTH_")) delete cliEnv[key];
      const child = spawn(command, argv, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, env: cliEnv });
      let output = "";
      let diagnostics = "";
      const timer = setTimeout(() => { child.kill(); reject(new Error("Vercel request timed out.")); }, 60000);
      child.stdout.on("data", (data) => {
        output += data.toString();
        if (output.length > 2000000) { child.kill(); reject(new Error("Unexpected Vercel response size.")); }
      });
      // Bounded diagnostics are classified, never printed as raw text.
      child.stderr.on("data", (data) => { diagnostics = (diagnostics + data.toString()).slice(-16000); });
      child.stdin.on("error", () => {});
      child.once("error", () => { clearTimeout(timer); reject(new Error("Vercel CLI could not start.")); });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error(safeVercelFailure(step, code, output, diagnostics)));
        try { resolve(JSON.parse(output) as Record<string, unknown>); }
        catch { reject(new Error("Unexpected Vercel response format.")); }
      });
      child.stdin.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  const target = await vercel("project", `/v9/projects/${project}`);
  if (target.id !== project || target.name !== "graymills-chatgpt-mcp-test" ||
      target.rootDirectory !== "experiments/oauth-resource" || target.accountId !== team) {
    throw new Error("The Vercel target is not the approved MCP test project.");
  }
  const inventory = await vercel("inventory", `/v10/projects/${project}/env`);
  if (!Array.isArray(inventory.envs)) throw new Error("Could not verify the MCP environment settings.");
  checkResourceEnvironment(inventory.envs as { key: string; target?: string[] }[]);

  // This initializes the auth library only inside this local child process.
  // No HTTP server is started and no hosted enable flag is changed.
  env.OAUTH_BASE_URL = "https://graymills-chatgpt-auth-test.vercel.app";
  env.OAUTH_ALLOWED_HOST = "graymills-chatgpt-auth-test.vercel.app";
  env.OAUTH_RESOURCE = "https://graymills-chatgpt-mcp-test.vercel.app/api/integrations/chatgpt/mcp";
  env.OAUTH_ALLOWED_RESOURCE_HOST = "graymills-chatgpt-mcp-test.vercel.app";
  env.OAUTH_ALLOWED_DB_HOST = env.OAUTH_SETUP_DATABASE_HOST;
  env.OAUTH_DATABASE_URL = hostedOperatorDatabaseUrl(env.OAUTH_SETUP_DATABASE_URL,
    env.OAUTH_SETUP_DATABASE_HOST, env.OAUTH_SETUP_PROJECT_REF);
  env.OAUTH_SERVER_SECRET = env.OAUTH_SETUP_SERVER_SECRET;
  env.OAUTH_DATABASE_CA_CERT = readFileSync(env.OAUTH_SETUP_CA_FILE ?? "", "utf8");
  env.OAUTH_DEPLOY_ENABLED = "true";
  const runtime = await import("./auth");
  pool = runtime.pool;
  const existing = await runtime.pool.query('select "id" from "chatgpt_oauth"."oauthClient" where "name"=$1 limit 1', [INTROSPECTION_CLIENT_NAME]);
  if (existing.rowCount) throw new Error("OAuth client settings need review; a validation client already exists.");
  const result = await registerIntrospectionClient({
    handler: runtime.auth.handler, base: env.OAUTH_BASE_URL, resource: env.OAUTH_RESOURCE,
    email: env.OAUTH_SETUP_EMAIL ?? "", password: env.OAUTH_SETUP_PASSWORD ?? "",
    subject: env.OAUTH_SETUP_SUBJECT ?? "",
    async persist({ clientId, clientSecret }) {
      await vercel("save", `/v10/projects/${project}/env`, [
        { key: "MCP_INTROSPECTION_CLIENT_ID", value: clientId, type: "encrypted", visibility: "config", target: ["production", "preview"] },
        { key: "MCP_INTROSPECTION_CLIENT_SECRET", value: clientSecret, type: "sensitive", visibility: "secret", target: ["production", "preview"] },
        { key: "MCP_OAUTH_CLIENT_ID", value: CHATGPT_CLIENT_ID, type: "encrypted", visibility: "config", target: ["production", "preview"] },
      ]);
      const saved = await vercel("verify", `/v10/projects/${project}/env`);
      if (!Array.isArray(saved.envs)) throw new Error("Vercel client settings could not be confirmed.");
      checkSavedClientEnvironment(saved.envs as { key: string; target?: string[] }[]);
    },
  });
  console.log("PASS: Dedicated OAuth login verified.");
  console.log("PASS: Validation client registered and its credentials verified.");
  console.log("PASS: Client credentials saved directly in Vercel for Production and Preview.");
  console.log("Validation client ID:", result.clientId);
  console.log("Hosted OAuth enable flags were not changed.");
} catch (error) {
  // Fixed messages from this file/core are safe; never print a pg error/body.
  const message = error instanceof Error ? error.message : "";
  const safe = /^(Invalid operator target\.|Invalid CLI request\.|Vercel |Unexpected Vercel |Could not verify the MCP |The Vercel target |OAuth client settings |Missing MCP_|The dedicated OAuth login |OAuth login identity |Private validation client |Validation client credentials)/.test(message);
  console.error("SETUP STOPPED:", safe ? message : "Private client setup failed. No secret values were printed.");
  console.error("Leave both hosted OAuth enable flags false. Any partial client settings need review before retrying.");
  process.exitCode = 1;
} finally {
  if (pool) await pool.end().catch(() => {});
}
