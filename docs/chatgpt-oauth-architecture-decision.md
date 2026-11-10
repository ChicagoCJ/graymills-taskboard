# TaskBoard 3.16K — Isolated OAuth architecture decision

**Decision:** Use an isolated Better Auth OAuth provider for the ChatGPT MCP connector. This is a design decision, not authorization to modify production services. Implement on a separate development service/hostname and a separate auth database. Do not attach Better Auth's tables to the existing production Supabase database.

## Goals and invariants

- ChatGPT reads only the Parts Washers — SEO & AI Search project. The TaskBoard app and Supabase remain the task system of record.
- Never change TaskBoard employee sign-in (`supabase.auth.signInWithPassword`) or `src/app/page.tsx` to accommodate OAuth.
- Only the dedicated integration identity is permitted initially. No public self-signup, general TaskBoard employee OAuth linking, or write tools.
- Enforce a specific client identity, short-lived OAuth access token, issuer, expiration, **resource audience**, and independent project authorization. OAuth consent and scopes do not replace database authorization.
- Do not allow service-role access from browser code or MCP queries.
- Keep existing Vercel Preview protection on the TaskBoard app. Never leak or embed the Vercel protection bypass secret in ChatGPT.
- Do not merge PR #1, enable Supabase OAuth Server, migrate the live Supabase database, or promote changes without specific review.

## Chosen components

1. **Independent Better Auth service** on its own stable HTTPS hostname. Better Auth with the `@better-auth/mcp` and `@better-auth/cimd` packages provides the OAuth authorization code flow with S256 PKCE, protected-resource and authorization-server discovery, consent, access-token issuance, key publishing, refresh and revocation. The JWT plugin must disable its session-token route/header and use OAuth provider mode to prevent confusion between user-session JWTs and resource access tokens.
2. **Dedicated authorization database.** Better Auth requires its own user, session, consent, client, key and token tables. Generate schema from pinned dependency versions, review the SQL before migration, and restrict database network access and credentials. Never point a migration at the live TaskBoard database.
3. **Protected MCP resource** is the existing TaskBoard endpoint. Validate OAuth bearer tokens with issuer + JWKS, `aud` for the MCP URL, allowed client ID, and the dedicated user authorization. The existing Supabase `auth.getUser(token)` currently validates **Supabase session tokens**, not Better Auth OAuth tokens: it must be replaced or isolated behind an explicit authentication-mode boundary before OAuth is activated. Never assume a Better Auth token is a Supabase token.
4. **Supabase data authorization bridge** is a separate design gate. Continue honoring Supabase RLS when retrieving tasks. An OAuth JWT cannot be passed directly into the Supabase client and expected to satisfy current RLS. Evaluate a short-lived dedicated integration-user Supabase session managed only by the backend, or an explicitly reviewed, least-privilege server RPC. Do **not** use a service-role key to silently bypass RLS.
5. **Stable public endpoint.** OAuth redirects/discovery require a publicly reachable HTTPS hostname. Vercel's automation protection bypass headers are not a ChatGPT connector configuration mechanism. Keep the existing TaskBoard Preview protected while designing a public auth host and a narrowly exposed MCP route.
6. **ChatGPT client registration.** Prefer Client ID Metadata Documents (CIMD) where supported. Keep dynamic client registration disabled, and allow only reviewed client metadata/redirect URIs. Confirm ChatGPT's actual OAuth support before activation.

## Implementation sequence

- [x] 3.16H/3.16I: clean Next.js build and basic fail-closed MCP smoke tests in CI.
- [x] 3.16J: prevent discovery metadata advertising a mismatched MCP origin.
- [ ] Build/test an isolated Better Auth development service using an independent test database.
- [ ] Confirm a realistic ChatGPT client registration and redirect flow.
- [ ] Implement signed-token verification and a clear separation from legacy Supabase bearer authentication.
- [ ] Implement and test the RLS-preserving Supabase data-access bridge.
- [ ] Run negative tests: wrong issuer, audience, client, user, project, expired/revoked token, unsigned/invalid token, cookie-only login, cross-origin requests, and write attempts.
- [ ] Confirm correct deployment/public URL behavior with Vercel protection still enabled for TaskBoard.
- [ ] Conduct user-assisted end-to-end sign-in and SEO task lookup in Preview.
- [ ] Seek explicit approval for any new persistent infrastructure and for production rollout.

## Required external actions when reached

A new authorization hostname, a separate auth database, and secret storage must be provisioned. Those are persistent infrastructure/security changes and need explicit user approval before provisioning. Until then, do not create auth tables or enable new sign-in endpoints on production.

## Primary implementation references

- https://better-auth.com/docs/plugins/mcp
- https://better-auth.com/docs/plugins/oauth-provider
- https://better-auth.com/docs/plugins/oauth-provider/tokens
- https://better-auth.com/docs/plugins/oauth-provider/clients
