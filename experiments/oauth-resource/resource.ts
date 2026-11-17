import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import type { JWTVerifyGetKey } from "jose";
import * as z from "zod/v4";
import { readConfig, MCP_PATH, METADATA_PATH, type Environment } from "./config";
import { readSeoData } from "./data";
import { InvalidToken, verifyOAuth } from "./oauth";

const securityHeaders = {
  "cache-control": "private, no-store, max-age=0",
  "x-content-type-options": "nosniff",
};
const toolPolicy = {
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  _meta: { securitySchemes: [{ type: "oauth2", scopes: ["openid"] }] },
};
const json = (body: unknown, status: number, extra = {}) => Response.json(body, {
  status, headers: { ...securityHeaders, ...extra },
});

type Dependencies = {
  env?: Environment;
  requestFetch?: typeof fetch;
  verifyKey?: JWTVerifyGetKey;
};

// Dependencies are injectable only by in-process tests, never by HTTP input.
export async function handleMetadata(request: Request, dependencies: Dependencies = {}) {
  try {
    const config = readConfig(request, dependencies.env);
    if (!config) return json({ error: "Connector is disabled." }, 503);
    return json({ resource: config.resource, authorization_servers: [config.issuer],
      bearer_methods_supported: ["header"], scopes_supported: ["openid"] }, 200);
  } catch { return json({ error: "Connector is not configured." }, 503); }
}

export async function handleResource(request: Request, dependencies: Dependencies = {}) {
  let config;
  try { config = readConfig(request, dependencies.env); }
  catch { return json({ error: "Connector is not configured." }, 503); }
  if (!config) return json({ error: "Connector is disabled." }, 503);
  if (new URL(request.url).pathname !== MCP_PATH) return json({ error: "Not found." }, 404);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(config.resource).origin) {
    return json({ error: "Origin not permitted." }, 403);
  }
  const challenge = { "www-authenticate":
    `Bearer resource_metadata="${new URL(METADATA_PATH, config.resource)}"` };
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer \S+$/i.test(authorization)) {
    return json({ error: "OAuth bearer token required." }, 401, challenge);
  }
  try {
    await verifyOAuth(config, authorization.replace(/^Bearer\s+/i, ""),
      dependencies.requestFetch, dependencies.verifyKey);
  } catch (error) {
    return error instanceof InvalidToken
      ? json({ error: "OAuth access denied." }, 401, challenge)
      : json({ error: "OAuth verification unavailable." }, 503);
  }
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, { allow: "POST" });

  const read = async (view: "project" | "tasks" | "task", taskId?: string) => {
    try {
      const data = await readSeoData(config, view, taskId, dependencies.requestFetch);
      if (view === "task" && "task" in data && !data.task) {
        return { isError: true, content: [{ type: "text" as const,
          text: "Task not found or not visible." }] };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
    } catch {
      return { isError: true, content: [{ type: "text" as const,
        text: "Restricted SEO data is unavailable." }] };
    }
  };
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: "graymills-taskboard-seo", version: "3.19.0" });
    server.registerTool("seo_project", {
      ...toolPolicy,
      description: "Read the approved Parts Washers SEO project. Read-only.",
      inputSchema: z.object({}).strict(),
    }, () => read("project"));
    server.registerTool("seo_tasks", {
      ...toolPolicy,
      description: "Read up to 100 nonarchived SEO tasks visible to the restricted Member. Read-only.",
      inputSchema: z.object({}).strict(),
    }, () => read("tasks"));
    server.registerTool("seo_task", {
      ...toolPolicy,
      description: "Read one visible task from the approved SEO project. Read-only.",
      inputSchema: z.object({ taskId: z.string().uuid() }).strict(),
    }, ({ taskId }) => read("task", taskId));
    return server;
  }, { responseMode: "json" });
  try {
    const response = await handler.fetch(request);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(securityHeaders)) headers.set(key, value);
    return new Response(response.body, { status: response.status, headers });
  } finally { await handler.close(); }
}
