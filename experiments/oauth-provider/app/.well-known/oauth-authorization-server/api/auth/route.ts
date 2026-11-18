import { NextRequest, NextResponse } from "next/server";
import { logAuthFailure } from "../../../../../auth-failure";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { auth } = await import("../../../../../auth");
    const { oauthProviderAuthServerMetadata } = await import("@better-auth/oauth-provider");
    return await oauthProviderAuthServerMetadata(auth)(request);
  } catch (error) {
    logAuthFailure(error);
    return NextResponse.json({ error: "OAuth discovery is not configured." }, {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
}
