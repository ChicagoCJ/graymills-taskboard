import { INTEGRATION_MARKER, PROJECT_ID, SUPABASE_ORIGIN, USER_ID, type Config } from "./config";

export class DataUnavailable extends Error {}

// Call only AFTER verifyOAuth succeeds. Supabase credentials and session
// tokens never become MCP response fields, client arguments, or log messages.
export async function readSeoData(
  config: Config,
  view: "project" | "tasks" | "task",
  taskId?: string,
  requestFetch: typeof fetch = fetch,
) {
  if (view === "task" && !taskId?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
    throw new DataUnavailable("Invalid task identifier.");
  }
  const call = async (path: string, options: RequestInit) => {
    try {
      const response = await requestFetch(SUPABASE_ORIGIN + path, {
        ...options, cache: "no-store", redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error();
      return await response.json();
    } catch { throw new DataUnavailable("Restricted data access unavailable."); }
  };
  const session = await call("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey: config.publishableKey, "content-type": "application/json" },
    body: JSON.stringify({ email: "sales@graymills.com", password: config.password }),
  });
  if (typeof session?.access_token !== "string" || !session.access_token) {
    throw new DataUnavailable("Restricted session unavailable.");
  }
  const headers = {
    apikey: config.publishableKey,
    authorization: `Bearer ${session.access_token}`,
  };
  const user = await call("/auth/v1/user", { method: "GET", headers });
  if (user?.id !== USER_ID ||
      user.app_metadata?.taskboard_integration !== INTEGRATION_MARKER) {
    throw new DataUnavailable("Restricted identity mismatch.");
  }
  const rows = async (table: string, params: Record<string, string>) => {
    const data = await call(`/rest/v1/${table}?${new URLSearchParams(params)}`, {
      method: "GET", headers,
    });
    if (!Array.isArray(data)) throw new DataUnavailable("Unexpected data response.");
    return data;
  };
  const profiles = await rows("profiles", {
    select: "id,role,is_active", id: `eq.${USER_ID}`, limit: "1",
  });
  if (profiles.length !== 1 || profiles[0].id !== USER_ID ||
      profiles[0].role !== "member" || profiles[0].is_active !== true) {
    throw new DataUnavailable("Restricted Member is not active.");
  }
  const projects = await rows("projects", {
    select: "id,name,description,status,target_date,is_active",
    id: `eq.${PROJECT_ID}`, is_active: "eq.true", limit: "1",
  });
  if (projects.length !== 1 || projects[0].id !== PROJECT_ID || projects[0].is_active !== true) {
    throw new DataUnavailable("Approved project is not visible.");
  }
  const p = projects[0];
  const project = { id: p.id, name: p.name, description: p.description,
    status: p.status, target_date: p.target_date, is_active: p.is_active };
  if (view === "project") return { project };
  const tasks = await rows("tasks", {
    select: "id,project_id,title,description,status,priority,due_date,start_date,waiting_on,created_at,updated_at,is_archived",
    project_id: `eq.${PROJECT_ID}`, is_archived: "eq.false",
    order: "created_at.desc", limit: view === "task" ? "1" : "100",
    ...(view === "task" ? { id: `eq.${taskId}` } : {}),
  });
  if (tasks.length > (view === "task" ? 1 : 100) ||
      tasks.some(t => t.project_id !== PROJECT_ID || t.is_archived !== false ||
        (view === "task" && t.id !== taskId))) {
    throw new DataUnavailable("Out-of-scope task response.");
  }
  const safeTasks = tasks.map(t => ({ id: t.id, project_id: t.project_id,
    title: t.title, description: t.description, status: t.status, priority: t.priority,
    due_date: t.due_date, start_date: t.start_date, waiting_on: t.waiting_on,
    created_at: t.created_at, updated_at: t.updated_at, is_archived: t.is_archived }));
  if (view === "task") return { project, task: safeTasks[0] ?? null };
  return { project, tasks: safeTasks, max_tasks: 100,
    note: "Only nonarchived SEO tasks visible to the restricted Member are included." };
}
