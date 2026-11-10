import { NextRequest, NextResponse } from "next/server";

// TaskBoard 3.16E: OAuth protected resource discovery for the SEO MCP endpoint.
// Fail closed until a reviewed OAuth issuer, client, and resource are configured.
// This does not enable OAuth, register clients, or modify existing login behavior.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSON_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: NextRequest) {
  const issuer = process.env.CHATGPT_OAUTH_ISSUER?.trim();
  const resource = process.env.CHATGPT_OAUTH_RESOURCE?.trim();
  const clientId = process.env.CHATGPT_OAUTH_CLIENT_ID?.trim();

  if (!issuer || !resource || !clientId) {
    return NextResponse.json(
      { error: "OAuth discovery not configured." },
      { status: 503, headers: JSON_HEADERS },
    );
  }

  let issuerUrl: URL;
  let resourceUrl: URL;
  try {
    issuerUrl = new URL(issuer);
    resourceUrl = new URL(resource);
  } catch {
    return NextResponse.json(
      { error: "Invalid OAuth discovery configuration." },
      { status: 503, headers: JSON_HEADERS },
    );
  }

  if (
    issuerUrl.protocol !== "https:" ||
    resourceUrl.protocol !== "https:" ||
    !issuerUrl.hostname ||
    !resourceUrl.hostname ||
    resourceUrl.pathname !== "/api/integrations/chatgpt/mcp" ||
    resourceUrl.origin !== request.nextUrl.origin ||
    resourceUrl.search ||
    resourceUrl.hash ||
    issuerUrl.search ||
    issuerUrl.hash
  ) {
    return NextResponse.json(
      { error: "Invalid OAuth discovery configuration." },
      { status: 503, headers: JSON_HEADERS },
    );
  }

  return NextResponse.json(
    {
      resource: resourceUrl.toString(),
      authorization_servers: [issuerUrl.toString()],
      bearer_methods_supported: ["header"],
    },
    { status: 200, headers: JSON_HEADERS },
  );
}
