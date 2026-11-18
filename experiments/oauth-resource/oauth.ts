import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { Config } from "./config";

export class InvalidToken extends Error {}
export class DependencyUnavailable extends Error {}
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function verifyOAuth(
  config: Config,
  token: string,
  requestFetch: typeof fetch = fetch,
  testKey?: JWTVerifyGetKey,
): Promise<void> {
  let getKey = testKey;
  if (!getKey) {
    getKey = keySets.get(config.issuer);
    if (!getKey) {
      const remoteKeySet = createRemoteJWKSet(new URL(config.issuer + "/jwks"), {
        timeoutDuration: 5000,
      });
      keySets.set(config.issuer, remoteKeySet);
      getKey = remoteKeySet;
    }
  }
  let claims;
  try {
    const verified = await jwtVerify(token, getKey, {
      issuer: config.issuer,
      audience: config.resource,
      algorithms: ["EdDSA", "ES256", "RS256"],
      typ: "at+jwt",
      requiredClaims: ["sub", "iat", "exp", "sid"],
    });
    claims = verified.payload;
    const now = Math.floor(Date.now() / 1000);
    const clients = [claims.client_id, claims.azp].filter(x => x !== undefined);
    if (claims.sub !== config.subject || typeof claims.sid !== "string" || !claims.sid ||
        typeof claims.iat !== "number" || typeof claims.exp !== "number" ||
        claims.iat > now + 30 || claims.exp - claims.iat > 300 ||
        claims.exp <= claims.iat || clients.length === 0 ||
        clients.some(x => x !== config.clientId) || claims.cnf !== undefined ||
        typeof claims.scope !== "string" || !claims.scope.split(" ").includes("openid")) {
      throw new Error("Not an approved session-bound OAuth access token.");
    }
  } catch {
    throw new InvalidToken("Invalid OAuth access token.");
  }

  // Local JWT validation alone cannot detect a terminated user session or
  // disabled client. Always introspect before presenting Supabase credentials.
  let response: Response;
  try {
    response = await requestFetch(config.issuer + "/oauth2/introspect", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token, token_type_hint: "access_token",
        client_id: config.introspectionClientId,
        client_secret: config.introspectionSecret,
      }),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new DependencyUnavailable("OAuth verification unavailable.");
  }
  if (!response.ok) throw new DependencyUnavailable("OAuth verification unavailable.");
  let state;
  try { state = await response.json(); }
  catch { throw new DependencyUnavailable("OAuth verification unavailable."); }
  const audiences = typeof state?.aud === "string" ? [state.aud] : state?.aud;
  if (state?.active !== true || state.sub !== config.subject ||
      state.iss !== config.issuer || state.client_id !== config.clientId ||
      !Array.isArray(audiences) || !audiences.includes(config.resource) ||
      typeof state.exp !== "number" || state.exp <= Date.now() / 1000 ||
      state.exp !== claims.exp || state.sid !== claims.sid ||
      typeof state.scope !== "string" || !state.scope.split(" ").includes("openid")) {
    throw new InvalidToken("OAuth session or client is no longer authorized.");
  }
}
