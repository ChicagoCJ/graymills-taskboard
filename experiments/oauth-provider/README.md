# Isolated TaskBoard OAuth prototype (CI-only, no production access)

**Status:** Standalone prototype passes its isolated GitHub Actions test. It is
**not deployed**, not imported by TaskBoard's Next.js app, and has no
connection to the live Supabase project.

The prototype uses Better Auth with MCP OAuth, Client ID Metadata Documents,
and a disposable PostgreSQL container in GitHub Actions. All environment
configuration uses test-only values. The CI database is destroyed after
each run.

## Verified in GitHub Actions (2026-11-10)

- Dependency install and TypeScript check
- Disposable PostgreSQL schema migration
- Safe rejection of malformed OAuth requests (no external redirects)
- Authorization-server metadata with issuer and token/authorization endpoints
- No public unauthenticated dynamic-client-registration endpoint
- Fictitious user signup and session creation **only** with the CI flag enabled
- Authenticated registration of a public OAuth client (HTTP 201)
- Authorization-code request with S256 PKCE that requires local consent
- Signed consent, authorization-code callback, and token exchange
- Resource-bound JWT with correct issuer, audience, and client identity
- Cryptographic signature verification using issuer's published JWKS
- Rejection of wrong issuer, audience, client, subject, and tampered tokens
- Independent TaskBoard build and existing fail-closed MCP tests

## Isolation and limits

- The auth service and its database are loopback-only. The prototype rejects
  non-local issuer, PostgreSQL, and MCP resource hosts.
- The test-only `OAUTH_TEST_ENABLE_SIGNUP=true` flag permits a disposable
  fictitious user inside CI; no signup or credential handling is deployed.
- Tests do not expose raw access tokens, client secrets, or live credentials.
- No production Supabase database, tables, authentication hooks, or RLS policies
  have been modified.
- A reusable verifier lives in `verify-resource-token.ts`; the live TaskBoard
  MCP route still uses Supabase bearer sessions and **has not** been switched
  to accept these Better Auth tokens.
- Token revocation/refresh, production-grade user sign-in, account consent,
  secure credential provisioning, and a persistent authorization database
  remain outstanding.
- The prototype uses pinned package versions, but requires a committed lockfile
  before deployment. CI uses a clean disposable dependency installation.

## Release gates — not yet approved

1. Choose and provision a private persistent authorization storage area.
   Reusing the existing Supabase project's **private schema** would avoid
   another project charge but still constitutes a live database schema change;
   it requires explicit approval and reviewed SQL/migration before execution.
2. Establish a stable HTTPS authorization hostname and a narrowly exposed MCP
   route without disabling TaskBoard's Preview protection.
3. Use a secure restricted identity and private access to authentication tables;
   no public Data API exposure or service-role bypass.
4. Design the Supabase RLS-preserving bridge for the dedicated integration user.
5. Implement revocation, refresh, consent UX, token rotation, negative tests
   and real connector sign-in against the test environment.
6. Obtain explicit approval before any production rollout or altering the
   working TaskBoard or its Supabase security settings.
