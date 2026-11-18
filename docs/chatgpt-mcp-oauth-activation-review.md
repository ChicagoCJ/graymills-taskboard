# TaskBoard 3.16G — ChatGPT MCP OAuth activation review

**Status:** Design / activation blocked. No production auth changes approved.
**Scope:** Only Parts Washers — SEO & AI Search project. TaskBoard remains system of record.
**Existing implementation:** Read-only MCP endpoint at `/api/integrations/chatgpt/mcp`; discovery at `/.well-known/oauth-protected-resource/api/integrations/chatgpt/mcp`.

## Findings verified against Supabase / MCP documentation (November 2026)

1. Supabase OAuth access tokens include `client_id`, but the documented default `aud` is `authenticated`, not the MCP resource URL. Current TaskBoard OAuth enforcement requires BOTH the configured `client_id` and MCP resource URL in `aud`. As a result, default OAuth tokens will be rejected until a safe audience solution is verified.
2. Supabase Custom Access Token Hooks can customize the audience, but the hook applies to all token issuance. Changing the hook in the shared production Supabase project requires an impact review and separate approval.
3. Supabase OAuth scopes (`openid`, `email`, `profile`, `phone`) do NOT independently restrict database access. Protect reads at the MCP endpoint; preserve RLS. Never treat an OAuth scope as authorization to other TaskBoard projects.
4. Vercel Preview is deployment-protected. The temporary automation bypass secret is for operator testing only, not a viable ChatGPT sign-in design. Do not embed it in URLs, client code, logs, or ChatGPT.
5. Existing MCP endpoint permits only the configured integration user and SEO project, and its `seo_tasks` list is RLS-limited and capped at 100 tasks. Project-wide inventory is not yet guaranteed.
6. The protected resource discovery endpoint is intentionally disabled (HTTP 503) until `CHATGPT_OAUTH_ISSUER`, `CHATGPT_OAUTH_CLIENT_ID`, and `CHATGPT_OAUTH_RESOURCE` are reviewed and configured. OAuth client/resource validation also remains inactive until its two corresponding settings are set.

## Architecture decision required before OAuth activation

**Option A: Supabase OAuth Server.** Reuse Supabase identity and OAuth registration, but first validate actual token claims, issuer/discovery, user consent/registration, and implications of any Custom Access Token Hook. Do not enable the Beta OAuth Server or modify shared token hooks without approval.

**Option B: Isolated authorization service.** New authorization issuer/token lifecycle and exchange with the existing dedicated Supabase identity. More engineering and security work, but it avoids modifying employee login and shared Supabase Auth configuration. Requires secure token issuance, refresh/revocation, client binding, and per-request resource checks. Do not implement an improvised token issuer without a thorough design.

**Recommended near-term approach:** Keep both options open and use the existing read-only MCP implementation for controlled test traffic. Re-evaluate the audience strategy and Vercel Preview accessibility before selecting the OAuth issuer.

## Pre-activation gates

- [ ] Confirm the actual Preview build result; GitHub's `Vercel Preview Comments` check alone is not a build test.
- [ ] Verify exact MCP resource URL and HTTPS issuer; validate discovery via unauthenticated request once configured.
- [ ] Confirm access-token issuer, signature, expiration, `client_id`, intended resource/audience, and user identity; reject ordinary TaskBoard sessions once OAuth mode is activated.
- [ ] Confirm ChatGPT OAuth registration/redirect behavior and consent, without enabling employee-wide access.
- [ ] Demonstrate integration-user access to authorized SEO tasks; document RLS gaps and 100-task cap.
- [ ] Verify cross-project reads are denied and that no write tools are exposed.
- [ ] Resolve protected Preview access without sharing automation bypass secrets with ChatGPT.
- [ ] Separate and approve any shared Supabase/Auth changes.
- [ ] Remove the temporary integration test task after tests.
- [ ] Revoke the temporary Vercel automation bypass secret when no longer required.
- [ ] Do not merge into `main` or promote to production without explicit approval.

## References

- Supabase OAuth Server: https://supabase.com/docs/guides/auth/oauth-server
- Supabase OAuth flows and default `aud`: https://supabase.com/docs/guides/auth/oauth-server/oauth-flows
- Supabase Getting Started / Custom Access Token Hooks: https://supabase.com/docs/guides/auth/oauth-server/getting-started
- MCP Authorization specification: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
