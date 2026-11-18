import { verifyResourceToken } from "./verify-resource-token.js";
import type { JSONWebKeySet } from "jose";

export type OAuthRlsBridgeConfig = {
  oauthToken: string;
  jwks: JSONWebKeySet;
  issuer: string;
  resource: string;
  clientId: string;
  oauthSubject: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  integrationEmail: string;
  integrationPassword: string;
  integrationUserId: string;
  projectId: string;
};

type ResponseFetch = typeof fetch;
type Project = { id: string; name: string; is_active: boolean };
type Profile = { id: string; role: string; is_active: boolean };
type Task = { id: string; project_id: string; title: string; is_archived: boolean };

/**
 * A deliberately narrow, server-side identity bridge for the isolated test.
 *
 * The signed OAuth token proves authorization to call the resource; it is NOT
 * a Supabase JWT. A separately provisioned, least-privileged Supabase Auth
 * Member signs in server-side to obtain an actual RLS-scoped Supabase session.
 * No service_role key, admin API, SECURITY DEFINER or client-supplied project
 * selector is used. Never send the resulting Supabase token back to callers.
 *
 * This module is not yet called by the deployed MCP endpoint. Before enabling
 * it, provision and verify a dedicated Supabase Auth Member, restrict its
 * project access, and test the real end-to-end request path.
 */
export async function readApprovedProjectViaOAuth(
  config: OAuthRlsBridgeConfig,
  requestFetch: ResponseFetch = fetch,
): Promise<{ project: Project; tasks: Task[] }> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(config.integrationUserId) || !uuid.test(config.projectId) ||
      !config.supabasePublishableKey || !config.integrationEmail ||
      !config.integrationPassword || !config.oauthSubject) {
    throw new Error("RLS bridge is not configured.");
  }
  const origin = new URL(config.supabaseUrl);
  if (origin.protocol !== "https:" || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash ||
      !/^[a-z0-9-]+\.supabase\.co$/.test(origin.hostname)) {
    throw new Error("Unapproved Supabase origin.");
  }

  // Verify signature, issuer, intended audience, client, subject, expiry.
  // This must happen BEFORE presenting the dedicated user's credentials.
  await verifyResourceToken({
    token: config.oauthToken,
    jwks: config.jwks,
    issuer: config.issuer,
    resource: config.resource,
    clientId: config.clientId,
    subject: config.oauthSubject,
  });

  const api = origin.origin;
  const apiKey = config.supabasePublishableKey;
  const sessionResponse = await requestFetch(`${api}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "apikey": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      email: config.integrationEmail,
      password: config.integrationPassword,
    }),
    cache: "no-store",
  });
  if (!sessionResponse.ok) throw new Error("Dedicated integration sign-in failed.");
  const session = await sessionResponse.json() as { access_token?: unknown };
  if (typeof session.access_token !== "string" || !session.access_token) {
    throw new Error("Dedicated integration session missing.");
  }

  const rlsHeaders = {
    "apikey": apiKey,
    "authorization": `Bearer ${session.access_token}`,
    "accept": "application/json",
  };
  // Confirm the *Supabase-validated* session user matches the dedicated
  // Member; never trust the OAuth subject as a Supabase user ID.
  const userResponse = await requestFetch(`${api}/auth/v1/user`, {
    method: "GET", headers: rlsHeaders, cache: "no-store",
  });
  if (!userResponse.ok) throw new Error("Dedicated integration session invalid.");
  const user = await userResponse.json() as { id?: unknown };
  if (user.id !== config.integrationUserId) {
    throw new Error("Dedicated integration identity mismatch.");
  }

  const getRows = async (table: "profiles" | "projects" | "tasks", params: URLSearchParams): Promise<unknown[]> => {
    const response = await requestFetch(`${api}/rest/v1/${table}?${params.toString()}`, {
      method: "GET", headers: rlsHeaders, cache: "no-store",
    });
    if (!response.ok) throw new Error("RLS-protected data access failed.");
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw new Error("Unexpected RLS query response.");
    return rows;
  };
  const profileRows = await getRows("profiles", new URLSearchParams({
    select: "id,role,is_active", id: `eq.${config.integrationUserId}`, limit: "1",
  })) as Profile[];
  const profile = profileRows[0];
  if (profileRows.length !== 1 || profile?.id !== config.integrationUserId ||
      profile.role !== "member" || profile.is_active !== true) {
    throw new Error("Integration Member is not active or authorized.");
  }
  const projectRows = await getRows("projects", new URLSearchParams({
    select: "id,name,is_active", id: `eq.${config.projectId}`, is_active: "eq.true", limit: "1",
  })) as Project[];
  const project = projectRows[0];
  if (projectRows.length !== 1 || project?.id !== config.projectId ||
      project.is_active !== true) {
    throw new Error("Approved project not visible to integration Member.");
  }
  const taskRows = await getRows("tasks", new URLSearchParams({
    select: "id,project_id,title,is_archived",
    project_id: `eq.${config.projectId}`,
    is_archived: "eq.false",
    order: "created_at.desc",
    limit: "100",
  })) as Task[];
  if (taskRows.length > 100 ||
      taskRows.some((task) => task.project_id !== config.projectId || task.is_archived !== false)) {
    throw new Error("RLS query returned out-of-scope tasks.");
  }
  return { project, tasks: taskRows };
}
