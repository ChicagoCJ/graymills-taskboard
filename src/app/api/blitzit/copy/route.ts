import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function getBlitzitSecret(rawHeaderValue: string | null) {
  if (!rawHeaderValue) return "";

  const trimmed = rawHeaderValue.trim();

  if (!trimmed) return "";

  // Handles:
  // x-blitzit-secret: abc123
  if (trimmed.toLowerCase().startsWith("x-blitzit-secret:")) {
    return trimmed.split(":").slice(1).join(":").trim();
  }

  // Handles:
  // x-blitzit-secret abc123
  if (trimmed.toLowerCase().startsWith("x-blitzit-secret ")) {
    return trimmed.replace(/^x-blitzit-secret\s+/i, "").trim();
  }

  // Handles:
  // abc123
  return trimmed;
}

function cleanDateForBlitzit(dateValue: string | null) {
  // Blitzit docs list due_date as a supported field.
  // Sending an empty string is safer than sending null.
  return dateValue || "";
}

function formatTaskDescription(input: {
  description: string | null;
  priority: string;
  status: string;
  projectName: string;
  assignedTo: string;
  sourceTaskId: string;
}) {
  const lines = [
    `Priority: ${input.priority}`,
    `Status: ${input.status}`,
    `Project: ${input.projectName}`,
    `Assigned: ${input.assignedTo}`,
    `Source: Graymills TaskBoard`,
    `Source Task ID: ${input.sourceTaskId}`,
  ];

  if (input.description?.trim()) {
    lines.push("", input.description.trim());
  }

  return lines.join("\n");
}

export async function POST(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Missing Supabase environment variables on the server." },
      { status: 500 }
    );
  }

  const authorization = request.headers.get("authorization") ?? "";

  if (!authorization.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing signed-in user token." },
      { status: 401 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: userError?.message || "Could not verify signed-in user." },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  const taskId = body?.taskId as string | undefined;

  if (!taskId) {
    return NextResponse.json({ error: "Missing taskId." }, { status: 400 });
  }

  const { data: integration, error: integrationError } = await supabase
    .from("user_integrations")
    .select("webhook_url, webhook_header, is_enabled")
    .eq("profile_id", user.id)
    .eq("integration_name", "blitzit")
    .maybeSingle();

  if (integrationError) {
    return NextResponse.json(
      { error: `Could not load Blitzit settings: ${integrationError.message}` },
      { status: 500 }
    );
  }

  if (!integration?.is_enabled || !integration.webhook_url || !integration.webhook_header) {
    return NextResponse.json(
      {
        error:
          "Blitzit settings are missing. Save your Webhook URL and Signing Secret first.",
      },
      { status: 400 }
    );
  }

  const secret = getBlitzitSecret(integration.webhook_header);

  if (!secret) {
    return NextResponse.json(
      {
        error:
          "Blitzit signing secret is blank. Re-save the signing secret from Blitzit.",
      },
      { status: 400 }
    );
  }

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, title, description, status, priority, due_date, project_id")
    .eq("id", taskId)
    .single();

  if (taskError || !task) {
    return NextResponse.json(
      { error: taskError?.message || "Could not load the task." },
      { status: 404 }
    );
  }

  let projectName = "No project";

  if (task.project_id) {
    const { data: project } = await supabase
      .from("projects")
      .select("name")
      .eq("id", task.project_id)
      .maybeSingle();

    projectName = project?.name ?? "Project";
  }

  const { data: assignees } = await supabase
    .from("task_assignees")
    .select("profile_id, team_id")
    .eq("task_id", task.id);

  const profileIds = (assignees ?? [])
    .map((row) => row.profile_id)
    .filter(Boolean) as string[];

  const teamIds = (assignees ?? [])
    .map((row) => row.team_id)
    .filter(Boolean) as string[];

  const assignedNames: string[] = [];

  if (profileIds.length > 0) {
    const { data: assignedProfiles } = await supabase
      .from("profiles")
      .select("full_name, email")
      .in("id", profileIds);

    (assignedProfiles ?? []).forEach((profile) => {
      assignedNames.push(profile.full_name || profile.email || "Unnamed user");
    });
  }

  if (teamIds.length > 0) {
    const { data: assignedTeams } = await supabase
      .from("teams")
      .select("name")
      .in("id", teamIds);

    (assignedTeams ?? []).forEach((team) => {
      assignedNames.push(`${team.name} Team`);
    });
  }

  const blitzitPayload = {
    action: "create",
    id: task.id,
    title: task.title || "Untitled task",
    description: formatTaskDescription({
      description: task.description,
      priority: task.priority,
      status: task.status,
      projectName,
      assignedTo:
        assignedNames.length > 0 ? assignedNames.join(", ") : "Unassigned",
      sourceTaskId: task.id,
    }),
    due_date: cleanDateForBlitzit(task.due_date),
  };

  const blitzitResponse = await fetch(integration.webhook_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-blitzit-secret": secret,
    },
    body: JSON.stringify(blitzitPayload),
  });

  const responseText = await blitzitResponse.text().catch(() => "");

  if (!blitzitResponse.ok) {
    return NextResponse.json(
      {
        error: `Blitzit rejected the task copy. Status ${blitzitResponse.status}. ${responseText}`,
        sentPayloadPreview: {
          action: blitzitPayload.action,
          id: blitzitPayload.id,
          title: blitzitPayload.title,
          due_date: blitzitPayload.due_date,
          description_length: blitzitPayload.description.length,
        },
      },
      { status: 502 }
    );
  }

  const { error: updateError } = await supabase
    .from("tasks")
    .update({ blitzit_copied_at: new Date().toISOString() })
    .eq("id", task.id);

  if (updateError) {
    return NextResponse.json(
      {
        error: `Task copied to Blitzit, but copied status could not be saved: ${updateError.message}`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    blitzitResponse: responseText || "Copied to Blitzit.",
  });
}