# TaskBoard ChatGPT integration: restricted Supabase Auth Member security gate

Status: **Design / read-only audit, not approved for activation** (2026-11-16).

## Verified from existing Supabase policies (read-only inspection)

- OAuth test application's PostgreSQL role `chatgpt_oauth_runtime` is a **database role** used for the private `chatgpt_oauth` authorization-server schema. It is **not** the Supabase Auth user whose JWT can read TaskBoard tables.
- The TaskBoard RLS policy `Members can read active projects` allows any `authenticated` user to read all active projects. The MCP endpoint's hardcoded SEO project filter is **not** an equivalent database permission restriction.
- `Members can update assigned tasks` allows an active Member to update assigned tasks; there are also INSERT/UPDATE/DELETE policies on other public tables.
- `can_see_task` considers assigned tasks and team memberships across projects.
- A read-only Auth user count query found **no obvious dedicated ChatGPT/integration Auth user by name**. This does not prove none exists under another address.
- A read-only policy inventory shows access rules on additional tables, including comments, subtasks, attachments, tags, activity logs, teams, and user integrations. Restricting just `projects` and `tasks` would be incomplete.

## Mandatory release gates

1. **Do not create or sign in a real Supabase Auth integration user yet.** Do not use a human employee's credentials.
2. Design a user-specific, fail-closed RLS isolation policy across **every relevant public table and write operation**, and verify function and Storage access too. The policy must leave all existing employee access unchanged. A default `member` role does **not** meet the isolation requirement.
3. Review the proposal and run tests with disposable identities and database fixtures. Include unrelated-project reads, assigned-task UPDATE, INSERT/DELETE, comments, team membership, profile self-update/role escalation, and attempts to access unrelated tables.
4. Confirm the identity can read only the explicitly authorized SEO project and its RLS-visible tasks and **cannot perform any mutation**, even when the caller bypasses the MCP application and calls Supabase APIs directly.
5. Only after the DB restrictions are tested, provision a dedicated Auth identity through an approved secure admin workflow. Keep credentials in server-only Preview secrets. Do not put passwords, tokens, service_role keys, or personal employee credentials into GitHub or chat.
6. The current `experiments/oauth-provider/rls-identity-bridge.ts` is **prototype code only**. It is not imported by the live MCP route. It verifies OAuth before signing in through a dedicated Supabase Auth Member, then uses the member's JWT for reads; it does not mint privileged Supabase tokens.
7. Before enabling the bridge, verify the OAuth issuer's JWKS independently, pin the approved client ID and OAuth subject, verify issuer and resource URL, and ensure all signed-in user credentials and JWKS are server-side only. Review latency, rate limiting, lifecycle/revocation, and logging.
8. Verify the existing TaskBoard MCP endpoint remains read-only and does not accept a Better Auth token as if it were a Supabase Auth token.
9. Keep development in `feature/taskboard-3.16a-readonly`; leave PR #1 unmerged, leave production TaskBoard unchanged, and leave OAuth deployment flag off until end-to-end tests and explicit activation approval.

## Intended behavior

```text
ChatGPT OAuth token
  -> validate signature, issuer, audience, approved subject/client, expiration
  -> dedicated integration identity (never a human's session)
  -> Supabase RLS-scoped session
  -> enforce project-scoped, read-only database restrictions
  -> return only the authorized project and RLS-visible task data
```

## Next implementation

Create a SQL policy design and isolated test harness with negative tests across all accessible tables before provisioning the Supabase Auth Member. Apply **no production database migrations** during this design review.
