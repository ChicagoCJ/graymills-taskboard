# Isolated TaskBoard OAuth prototype (no production access)

This is **not deployed** and is not imported by the working Next.js app.

It tests Better Auth + MCP OAuth plugin initialization using a disposable
PostgreSQL service in GitHub Actions. The URL, database connection, and secret
come only from the test job. No TaskBoard production env vars are required.

## Security boundaries

- No auth signup enabled; no sign-in UI, OAuth client, token exchange or consent flow yet.
- No access to the TaskBoard Supabase database; no admin keys.
- Prototype refuses non-loopback base URLs.
- Packages are pinned for repeatability; create and commit a lockfile before deployment.
- Database tables must be generated/reviewed before attempting real OAuth flows.
- Existing Supabase auth tokens are not valid Better Auth OAuth tokens.
- GitHub Actions test service is destroyed when the job completes.

## Follow-up gates

1. Confirm package compatibility/typecheck in CI.
2. Generate schema and exercise discovery against the disposable database.
3. Add guarded sign-in/consent and OAuth client bootstrap for test identities.
4. Confirm JWT issuer, audience, client ID, expiry and revocation validation.
5. Resolve a secure Supabase RLS-preserving data-access bridge.
6. Obtain approval before any persistent infrastructure or production deployment.
