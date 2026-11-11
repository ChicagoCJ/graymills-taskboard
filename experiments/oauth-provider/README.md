# Isolated TaskBoard OAuth prototype (CI-only, no production access)

**Status:** Standalone prototype passes its isolated GitHub Actions test. It is
**not deployed** and not imported by TaskBoard's Next.js app. The
prototype's tests still use disposable PostgreSQL and no live credentials.

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
- On 2026-11-10, with explicit user approval and no new subscription, a
  private `chatgpt_oauth` schema was created in the existing Graymills TaskBoard
  Supabase project. It contains 12 empty Better Auth tables, 18 application
  indexes, RLS enabled on every table, and **no RLS policies**. Supabase API
  roles have no schema or table access. Existing TaskBoard tables, policies,
  and Supabase Auth settings were not modified.
- A reusable verifier lives in `verify-resource-token.ts`; the live TaskBoard
  MCP route still uses Supabase bearer sessions and **has not** been switched
  to accept these Better Auth tokens.
- The persistent private authentication schema is ready but deliberately
  **not usable by an application yet**: the restricted login was created but
  deliberately has no password and no deployed auth server credentials. Token revocation/refresh,
  production-grade user sign-in, consent UX, and secure credential provisioning
  remain outstanding.
- The prototype uses pinned package versions, but requires a committed lockfile
  before deployment. CI uses a clean disposable dependency installation.

## Release gates — not yet approved

1. **Completed with explicit approval:** provisioned the private schema and
   reviewed migration in the existing project; verified table RLS, API-role
   access denial, and migration history. No new project or subscription.
2. Establish a stable HTTPS authorization hostname and a narrowly exposed MCP
   route without disabling TaskBoard's Preview protection.
3. **Partially completed:** the `chatgpt_oauth_runtime` PostgreSQL LOGIN role
   exists with `NOINHERIT`, `NOBYPASSRLS`, `NOSUPERUSER`, no password, and
   maximum three connections. It has DML privileges and narrowly named RLS
   policies on the twelve private OAuth tables. Direct PostgreSQL checks
   confirmed it cannot read or write `public.tasks`, cannot read
   `public.profiles`, and cannot use Supabase's `auth` schema. A password
   must later be generated and stored as a server-only secret; no password
   may be committed, printed or passed to browser code. The new login does
   not own TaskBoard tables or gain any role-admin privileges.
4. Design the Supabase RLS-preserving bridge for the dedicated integration user.
5. Implement revocation, refresh, consent UX, token rotation, negative tests
   and real connector sign-in against the test environment.
6. Obtain explicit approval before any production rollout or altering the
   working TaskBoard or its Supabase security settings.

## Live database verification (2026-11-10)

- Migration `taskboard_317_restricted_chatgpt_oauth_runtime_login` succeeded.
- Twelve RLS policies restricted to `chatgpt_oauth_runtime` were verified.
- Twelve of twelve private tables grant only the required DML to this role.
- Role's password is `NULL` in `pg_authid`, verified without reading any hash.
- No existing TaskBoard tables, profiles, Supabase Auth settings, or employee
  sessions were changed.
- PostgreSQL still has global `PUBLIC` privileges on the `public`
  schema. A role-specific `search_path` is **not** a true isolation boundary.
  Its lack of TaskBoard table grants was explicitly tested. Pre-existing
  `SECURITY DEFINER` functions still require a separate security audit before
  exposing the OAuth service to untrusted network requests.

