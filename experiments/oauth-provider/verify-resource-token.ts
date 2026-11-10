import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";

type VerifyInput = {
  token: string;
  jwks: JSONWebKeySet;
  issuer: string;
  resource: string;
  clientId: string;
  subject: string;
};

// Intended for a future independent MCP resource. The current TaskBoard
// MCP route still accepts Supabase sessions; do not wire this in until
// issuer, storage, and RLS-preserving data access have been approved.
export async function verifyResourceToken(input: VerifyInput) {
  const { token, jwks, issuer, resource, clientId, subject } = input;
  if (!issuer || !resource || !clientId || !subject || !token ||
      !jwks?.keys?.length) {
    throw new Error("OAuth resource verifier configuration is incomplete.");
  }

  const result = await jwtVerify(token, createLocalJWKSet(jwks), {
    issuer,
    audience: resource,
    requiredClaims: ["sub", "exp", "iat"],
  });

  const payload = result.payload;
  if (payload.sub !== subject) {
    throw new Error("OAuth token subject is not the approved integration identity.");
  }

  // Both claim formats occur in OAuth implementations. If both are provided,
  // require both to match so a conflicting client identifier fails closed.
  const tokenClientId = payload.client_id;
  const authorizedParty = payload.azp;
  if (
    (typeof tokenClientId !== "string" && typeof authorizedParty !== "string") ||
    (typeof tokenClientId === "string" && tokenClientId !== clientId) ||
    (typeof authorizedParty === "string" && authorizedParty !== clientId)
  ) {
    throw new Error("OAuth token client is not approved.");
  }

  return payload;
}
