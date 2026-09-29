import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const validRoles = new Set(["admin", "manager", "member"]);

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status });
}

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      {
        error:
          "Missing server setup. Add SUPABASE_SERVICE_ROLE_KEY to .env.local and Vercel environment variables.",
      },
      500,
    );
  }

  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!accessToken) {
    return jsonResponse({ error: "Missing signed-in admin session." }, 401);
  }

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const {
    data: { user: requestingUser },
    error: requestingUserError,
  } = await adminSupabase.auth.getUser(accessToken);

  if (requestingUserError || !requestingUser) {
    return jsonResponse({ error: "Could not verify your admin session." }, 401);
  }

  const { data: requestingProfile, error: profileError } = await adminSupabase
    .from("profiles")
    .select("id, email, role, is_active")
    .eq("id", requestingUser.id)
    .single();

  if (profileError || !requestingProfile) {
    return jsonResponse({ error: "Could not verify your admin profile." }, 403);
  }

  if (requestingProfile.role !== "admin" || requestingProfile.is_active === false) {
    return jsonResponse({ error: "Only active admins can create users." }, 403);
  }

  const body = (await request.json().catch(() => null)) as
    | {
        email?: unknown;
        fullName?: unknown;
        password?: unknown;
        role?: unknown;
        profileColor?: unknown;
      }
    | null;

  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const role = typeof body?.role === "string" ? body.role : "member";
  const profileColor =
    typeof body?.profileColor === "string" && /^#[0-9a-fA-F]{6}$/.test(body.profileColor)
      ? body.profileColor
      : "#2563EB";

  if (!email || !email.includes("@")) {
    return jsonResponse({ error: "Enter a valid email address." }, 400);
  }

  if (!password || password.length < 8) {
    return jsonResponse(
      { error: "Temporary password must be at least 8 characters." },
      400,
    );
  }

  if (!validRoles.has(role)) {
    return jsonResponse({ error: "Role must be admin, manager, or member." }, 400);
  }

  const displayName = fullName || email.split("@")[0] || email;

  const { data: createdUserData, error: createUserError } =
    await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: displayName,
      },
    });

  if (createUserError || !createdUserData.user) {
    const message = createUserError?.message || "Could not create Auth user.";
    const alreadyExists = message.toLowerCase().includes("already");

    return jsonResponse(
      {
        error: alreadyExists
          ? "That email already exists in Supabase Auth. Use password reset or edit the existing profile instead."
          : message,
      },
      alreadyExists ? 409 : 400,
    );
  }

  const createdUser = createdUserData.user;

  const { error: profileUpsertError } = await adminSupabase
    .from("profiles")
    .upsert(
      {
        id: createdUser.id,
        email,
        full_name: displayName,
        role,
        profile_color: profileColor,
        is_active: true,
      },
      { onConflict: "id" },
    );

  if (profileUpsertError) {
    return jsonResponse(
      {
        error:
          "The Auth user was created, but the profile row could not be saved: " +
          profileUpsertError.message,
      },
      500,
    );
  }

  return jsonResponse({
    message: `User created for ${email}. Give them the temporary password privately and ask them to change it after signing in.`,
    userId: createdUser.id,
  });
}
