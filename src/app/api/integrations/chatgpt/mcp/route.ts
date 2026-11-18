import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

// TaskBoard 3.16B: authenticated, read-only MCP endpoint.
// This route does not alter page.tsx, Supabase policies, or any database record.
// OAuth and write capabilities are intentionally out of scope.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TASKS = 100;
const JSON_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function errorResponse(message: string, status: number, request?: NextRequest): NextResponse {
  const headers = new Headers(JSON_HEADERS);

  // OAuth discovery is advertised only after every relevant setting is
  // configured and the public MCP resource matches the request origin.
  // Until then, existing 401 responses remain unchanged.
  if (status === 401 && request) {
    const issuer = process.env.CHATGPT_OAUTH_ISSUER?.trim();
    const resource = process.env.CHATGPT_OAUTH_RESOURCE?.trim();
    const clientId = process.env.CHATGPT_OAUTH_CLIENT_ID?.trim();
    if (issuer && resource && clientId) {
      try {
        const issuerUrl = new URL(issuer);
        const resourceUrl = new URL(resource);
        if (
          issuerUrl.protocol === "https:" &&
          resourceUrl.protocol === "https:" &&
          resourceUrl.origin === request.nextUrl.origin &&
          resourceUrl.pathname === "/api/integrations/chatgpt/mcp" &&
          !resourceUrl.search && !resourceUrl.hash &&
          !issuerUrl.search && !issuerUrl.hash
        ) {
          const metadataUrl = new URL(
            "/.well-known/oauth-protected-resource" + resourceUrl.pathname,
            resourceUrl.origin,
          );
          headers.set(
            "WWW-Authenticate",
            `Bearer resource_metadata="${metadataUrl.toString()}"`,
          );
        }
      } catch {
        // Invalid OAuth configuration must not produce misleading discovery.
      }
    }
  }

  return NextResponse.json({ error: message }, { status, headers });
}

async function handle(request: NextRequest): Promise<Response> {
  // A browser-originated cross-site request must not access the endpoint.
  // Non-browser MCP clients normally send no Origin header.
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return errorResponse("Origin not permitted.", 403);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const allowedUserId = process.env.CHATGPT_INTEGRATION_USER_ID;
  const allowedProjectId = process.env.CHATGPT_SEO_PROJECT_ID;
  if (!url || !publishableKey || !allowedUserId || !allowedProjectId ||
      !UUID_RE.test(allowedUserId) || !UUID_RE.test(allowedProjectId)) {
    return errorResponse("Integration not configured.", 503);
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer \S+$/i.test(authorization)) {
    return errorResponse("Signed-in integration bearer token required.", 401, request);
  }
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  // The user's access token is carried into every Supabase request, preserving RLS.
  // Never use a service-role key for this endpoint.
  const supabase = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userResult, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userResult.user) return errorResponse("Invalid session.", 401, request);
  if (userResult.user.id !== allowedUserId) {
    return errorResponse("Not authorized for this integration.", 403);
  }

  // Optional, fail-closed OAuth client restriction. Not active until an approved
  // OAuth client ID is configured. Supabase validates the token with getUser
  // above; decode only the already-validated JWT to inspect its client_id claim.
  // OAuth scopes alone do not restrict Supabase database access.
  const approvedOAuthClientId = process.env.CHATGPT_OAUTH_CLIENT_ID?.trim();
  const approvedOAuthResource = process.env.CHATGPT_OAUTH_RESOURCE?.trim();
  // These settings must be deployed together. Never partially enable OAuth.
  if (Boolean(approvedOAuthClientId) !== Boolean(approvedOAuthResource)) {
    return errorResponse("OAuth integration configuration incomplete.", 503);
  }
  if (approvedOAuthClientId && approvedOAuthResource) {
    let payload: Record<string, unknown>;
    try {
      const payloadSegment = token.split(".")[1];
      if (!payloadSegment) return errorResponse("OAuth token claims required.", 403);
      payload = JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8")) as Record<string, unknown>;
    } catch {
      return errorResponse("OAuth token claims required.", 403);
    }

    // getUser(token) already verified the Supabase identity above; inspect the
    // resulting claims to ensure this OAuth token is for our client and resource.
    // aud can be a single string or an array per JWT conventions.
    const audiences = typeof payload.aud === "string"
      ? [payload.aud]
      : Array.isArray(payload.aud) && payload.aud.every((value) => typeof value === "string")
        ? payload.aud as string[]
        : [];
    if (payload.client_id !== approvedOAuthClientId ||
        !audiences.includes(approvedOAuthResource)) {
      return errorResponse("OAuth client or resource not authorized for this integration.", 403);
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles").select("id, role, is_active")
    .eq("id", allowedUserId).maybeSingle();
  if (profileError || !profile || profile.is_active !== true || profile.role !== "member") {
    return errorResponse("Integration identity must be an active Member.", 403);
  }

  // Fail closed if the integration Member cannot see the one permitted project.
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name, description, status, target_date, is_active")
    .eq("id", allowedProjectId).eq("is_active", true).maybeSingle();
  if (projectError) return errorResponse("Could not load authorized project.", 500);
  if (!project) return errorResponse("Authorized project not visible or inactive.", 404);

  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: "graymills-taskboard-seo", version: "3.16.0" });

    server.registerTool("seo_project", {
      description: "Read the single authorized Graymills Parts Washers SEO and AI Search project. Read-only.",
      inputSchema: z.object({}),
    }, async () => ({
      content: [{ type: "text" as const, text: JSON.stringify({ project }) }],
    }));

    server.registerTool("seo_tasks", {
      description: "List up to 100 non-archived tasks visible to the integration Member in the authorized SEO project. Read-only. This is not necessarily an all-project inventory because RLS also applies.",
      inputSchema: z.object({}),
    }, async () => {
      const { data, error } = await supabase.from("tasks")
        .select("id, project_id, title, description, status, priority, due_date, start_date, waiting_on, created_at, updated_at, is_archived")
        .eq("project_id", allowedProjectId).eq("is_archived", false)
        .order("created_at", { ascending: false }).limit(MAX_TASKS);
      if (error) return { isError: true, content: [{ type: "text" as const, text: "Could not load authorized tasks." }] };
      return { content: [{ type: "text" as const, text: JSON.stringify({ project, tasks: data ?? [], max_tasks: MAX_TASKS, note: "Supabase RLS limits tasks to those visible to the integration Member." }) }] };
    });

    server.registerTool("seo_task", {
      description: "Read one non-archived task by UUID in the authorized SEO project, only if visible to the integration Member. Read-only.",
      inputSchema: z.object({ taskId: z.string().uuid() }),
    }, async ({ taskId }) => {
      const { data, error } = await supabase.from("tasks")
        .select("id, project_id, title, description, status, priority, due_date, start_date, waiting_on, created_at, updated_at, is_archived")
        .eq("project_id", allowedProjectId).eq("is_archived", false).eq("id", taskId)
        .maybeSingle();
      if (error) return { isError: true, content: [{ type: "text" as const, text: "Could not load authorized task." }] };
      if (!data) return { isError: true, content: [{ type: "text" as const, text: "Task not found or not visible." }] };
      return { content: [{ type: "text" as const, text: JSON.stringify({ project, task: data }) }] };
    });

    return server;
  }, { responseMode: "json" });

  try {
    const response = await handler.fetch(request);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(JSON_HEADERS)) headers.set(key, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } finally {
    await handler.close();
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
