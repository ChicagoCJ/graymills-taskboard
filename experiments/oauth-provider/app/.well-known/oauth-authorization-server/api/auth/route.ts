import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { auth } = await import("../../../../../auth");
    const { oauthProviderAuthServerMetadata } = await import("@better-auth/oauth-provider");
    return oauthProviderAuthServerMetadata(auth)(request);
  } catch {
    return NextResponse.json({ error: "OAuth discovery is not configured." }, {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
}
