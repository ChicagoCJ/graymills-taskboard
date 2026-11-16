# Controlled Supabase integration rollout — preparation only

**Status:** PREPARED FOR REVIEW, NOT APPROVED FOR LIVE EXECUTION (2026-11-16).

**Scope:** Graymills TaskBoard, existing Supabase project `sxwwxeyclbduovrlvtxx`, Parts Washers — SEO & AI Search project `22eacfd8-22f8-4c01-a51d-44987facad42`. No new subscription, no changes to normal employee login, read-only connector.

## Verified live read-only preflight

Executed `live-rollout-preflight.readonly.sql` against the existing project. All **eight checks passed**:
- 18 public tables matched expected inventory; all have RLS.
- No existing policies prefixed `chatgpt_iso_`.
- Approved Parts Washers SEO project exists and is active.
- Private `task-attachments` bucket exists; `storage.objects` has RLS.
- Supabase Auth's `on_auth_user_created` trigger remains enabled.
- No obvious existing integration user by a *name-based* email scan; this is not proof that none exists.

The existing Auth trigger `public.handle_new_user()` creates an **active Member** profile immediately on user creation. Therefore **creating a login before isolation is active would create a period of overbroad access** under current RLS policies. Do not do that.

## Important design gap: do not apply the current review SQL directly

`integration-rls-isolation.review.sql` and
`integration-storage-isolation.review.sql` intentionally use a **synthetic test identity**
`f0000000-0000-4000-8000-000000000001`. They are not safe to install unchanged:
they would NOT limit the real Supabase Auth integration identity unless its exact UUID
matched the placeholder.

**Before any live migration, redesign the identity selector and rerun tests.**
Preferred candidate: provision the account with a fixed, admin-only
`app_metadata.taskboard_integration` marker (not editable `user_metadata`) and
install tested restrictive policies for this marker **before** user creation.
The marker must have a unique, reviewed value and the resulting account UUID must be
pinned in the MCP bridge; ordinary employees must not carry the marker.
Alternatively, design a controlled admin provisioning sequence that installs
UUID-specific RLS before enabling sign-in. Do not create an active Auth login
without restrictions.

## Deployment stages and explicit gates

1. **Review / design** (not done): finalize identity-selector approach and verify
   the marker cannot be self-assigned; consider signed URL leaks, `storage.buckets`
   permissions, SQL RPC/SECURITY DEFINER functions, and Auth management APIs.
   Incorporate findings in `functions-storage-audit.md`.
2. **Production-like testing** (not done): recreate real `public`, `storage`,
   triggers, original policies and relevant API behavior in a disposable
   isolated environment. Mocked synthetic fixtures alone do not prove production
   semantics. Verify legitimate employee behavior before and after.
3. **Change approval** (not granted): user explicitly authorizes installing
   reviewed RLS restrictions in the existing shared database. Take an auditable
   baseline snapshot of policies, roles, trigger definitions, and backup/recovery
   readiness. Review latest Supabase Advisors.
4. **Install restrictions** (not done): run the final reviewed migration
   transactionally with lock/statement timeouts. Confirm 72 restrictive
   public-table policies plus four `storage.objects` policies and no policy
   changes for existing employees. Do not use `service_role` to bypass checks.
5. **Provision dedicated Auth Member** (not done): do so only after restrictions
   are verified effective for the future account's trusted marker/identity;
   use a unique strong secret stored solely in server Preview environment.
   Verify a real login, `profiles.role=member`, account UUID, project/task
   SELECT, denied INSERT/UPDATE/DELETE, denied unrelated project/attachments,
   denied storage upload and RPC, and ordinary employee regression.
6. **Stage OAuth resource** (not done): wire the verified authorization-server
   JWKS and the separate OAuth-to-Supabase identity bridge into the *Preview*
   MCP resource. Verify issuer, audience, subject, approved client and revocation,
   and fail-closed behavior. No production merge or public release.
7. **Activate only with fresh approval** (not done): set server-only Vercel Preview
   settings and flag after full end-to-end negative tests. Do not enable
   employees' production authorization changes.

## Stop / rollback

If schema drift, test failure, increased privileges, unexpected user access,
or employee regression is found: **do not proceed**. First disable the
integration credentials and any OAuth resource route, revoke integration
sessions, and only then, if authorized, execute the reviewed
`live-rollout-rollback.review.sql`. The rollback removes only policies
prefixed `chatgpt_iso_`, not production employee policies or any preexisting
schema. Re-verify all employee access.

**IMPORTANT:** The rollback is not a justification to execute risky migrations.
It has not been tested against a production-like Supabase environment.

## Files / status

- `live-rollout-preflight.readonly.sql`: live SELECT-only preflight, **8 PASS**.
- `integration-rls-isolation.review.sql`: 72-policy prototype, synthetic ID,
  **NOT executable for production unchanged**.
- `integration-storage-isolation.review.sql`: four-policy prototype,
  synthetic ID, **NOT executable for production unchanged**.
- `live-rollout-rollback.review.sql`: review-only rollback plan.
- `verify-integration-rls.mjs`: GitHub CI disposable fixture tests.
- `functions-storage-audit.md`: prior detailed Security Advisor and RPC audit.

**No Supabase Auth user created; no live policy installed; no OAuth deployed;
no PR merged.**
