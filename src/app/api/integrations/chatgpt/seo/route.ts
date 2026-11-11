import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// TaskBoard 3.16A: read-only, project-scoped preparation for a ChatGPT MCP integration.
// Do not add POST/PATCH/DELETE handlers here. OAuth and write tools are later stages.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TASKS = 100;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" },
  });
}

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const allowedUserId = process.env.CHATGPT_INTEGRATION_USER_ID;
  const allowedProjectId = process.env.CHATGPT_SEO_PROJECT_ID;

  // Fail closed if any configuration is absent or malformed.
  if (!url || !publishableKey || !allowedUserId || !allowedProjectId ||
      !UUID_RE.test(allowedUserId) || !UUID_RE.test(allowedProjectId)) {
    return json({ error: "Integration not configured." }, 503);
  }

  const header = request.headers.get("authorization") ?? "";
  if (!/^Bearer \S+$/i.test(header)) {
    return json({ error: "Valid signed-in TaskBoard bearer token required." }, 401);
  }
  const token = header.replace(/^Bearer\s+/i, "").trim();

  // Use the authenticated caller's token, never the service-role key.
  const supabase = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userResult, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userResult.user) return json({ error: "Invalid session." }, 401);
  if (userResult.user.id !== allowedUserId) return json({ error: "Not authorized for this integration." }, 403);

  const { data: profile, error: profileError } = await supabase
    .from("profiles").select("id, role, is_active").eq("id", allowedUserId).maybeSingle();
  if (profileError || !profile || profile.is_active !== true || profile.role !== "member") {
    return json({ error: "Integration identity must be an active Member." }, 403);
  }

  // This route intentionally accepts no project ID from callers.
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name, description, status, target_date, is_active")
    .eq("id", allowedProjectId).eq("is_active", true).maybeSingle();
  if (projectError) return json({ error: "Could not load authorized project." }, 500);
  if (!project) return json({ error: "Authorized project is not visible or inactive." }, 404);

  const view = request.nextUrl.searchParams.get("view") ?? "project";
  if (view === "project") return json({ project });

  if (view !== "tasks" && view !== "task") {
    return json({ error: "Allowed views: project, tasks, task." }, 400);
  }

  const taskId = request.nextUrl.searchParams.get("taskId");
  if (view === "task" && (!taskId || !UUID_RE.test(taskId))) {
    return json({ error: "A valid taskId is required." }, 400);
  }

  let query = supabase.from("tasks")
    .select("id, project_id, title, description, status, priority, due_date, start_date, waiting_on, created_at, updated_at, is_archived")
    .eq("project_id", allowedProjectId)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });
  if (view === "task" && taskId) query = query.eq("id", taskId);

  const { data: tasks, error: tasksError } = await query.limit(view === "task" ? 1 : MAX_TASKS);
  if (tasksError) return json({ error: "Could not load authorized tasks." }, 500);
  if (view === "task" && !tasks?.length) return json({ error: "Task not found or not visible." }, 404);

  const ids = (tasks ?? []).map((item) => item.id as string);
  if (ids.length === 0) return json({ project, tasks: [], max_tasks: MAX_TASKS });

  const [assignees, subtasks, comments] = await Promise.all([
    supabase.from("task_assignees")
      .select("task_id, assignment_type, profile_id, team_id")
      .in("task_id", ids),
    supabase.from("task_subtasks")
      .select("id, task_id, title, is_done, sort_order, created_at")
      .in("task_id", ids).order("sort_order", { ascending: true }),
    supabase.from("task_comments")
      .select("id, task_id, profile_id, comment_text, created_at")
      .in("task_id", ids).order("created_at", { ascending: true }),
  ]);
  if (assignees.error || subtasks.error || comments.error) {
    return json({ error: "Could not load associated task details." }, 500);
  }
  const result = (tasks ?? []).map((task) => ({
    ...task,
    assignees: (assignees.data ?? []).filter((row) => row.task_id === task.id),
    subtasks: (subtasks.data ?? []).filter((row) => row.task_id === task.id),
    comments: view === "task"
      ? (comments.data ?? []).filter((row) => row.task_id === task.id)
      : undefined,
    comment_count: (comments.data ?? []).filter((row) => row.task_id === task.id).length,
  }));
  return view === "task"
    ? json({ project, task: result[0] })
    : json({ project, tasks: result, max_tasks: MAX_TASKS, note: "RLS permits only tasks visible to the integration Member. This is not yet an all-project inventory." });
}
