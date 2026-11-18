import { NextRequest, NextResponse } from "next/server";
import { logAuthFailure } from "../../../../auth-failure";

export const dynamic = "force-dynamic";

// Do not load the runtime service before a request. With no server-only
// credentials, the endpoint stays unavailable rather than partially working.
async function handle(request: NextRequest) {
  try {
    const { auth } = await import("../../../../auth");
    return await auth.handler(request);
  } catch (error) {
    logAuthFailure(error);
    return NextResponse.json(
      { error: "OAuth test service is not configured." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}

export const GET = handle;
export const POST = handle;
