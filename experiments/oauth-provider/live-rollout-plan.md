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

## Updated identity design (review-only)

The candidate SQL now uses an **administrator-controlled Supabase Auth `app_metadata` marker**:
`taskboard_integration: "graymills_seo_readonly_v1"`.

This avoids relying on a placeholder UUID before user creation. The policies apply
to any Supabase JWT with that trusted admin metadata, whether or not its
Auth user UUID was known when the policies were installed. For the marked
identity, they allow SELECT only on its own active `member` profile,
the one approved SEO project, and nonarchived SEO tasks; they block writes
on all 18 public tables and SELECT/write on `storage.objects`.

Normal employees without that marker retain their preexisting permissions.
**Never** place the marker in user-editable `user_metadata`, use an employee
account, or let the account sign in before policies are installed and verified.

The isolated GitHub fixture now simulates `auth.jwt().app_metadata`.
Passing simulated tests is **not** a live Supabase/Auth/Storage API validation.
The bridge must still pin the eventual approved Supabase Auth UUID and validate
the external OAuth token independently.

**This is not yet a production-ready migration.** The mark-and-provision
workflow and real API negative tests require explicit authorization.

## Production-like policy replay result (2026-11-16)

**PASS — GitHub Actions run 43974935891.** New test
`verify-live-core-policy-replay.mjs` uses a separate, disposable PostgreSQL
database and replays a read-only snapshot of **21 actual live RLS policies**
covering `profiles`, `projects`, `tasks`, `task_assignees`, and
`storage.objects`, plus **six actual public authorization helper functions**.
It does **not** copy customer records or secrets.

The test reproduces a known pre-change exposure: a normal Member assigned to
both projects can read both active projects and update an assigned task in an
unrelated project. After applying the proposed 72 restrictive public policies
and four storage policies, the marked integration identity is limited to SEO
project/task reads and rejected for tasks mutation, profile role edits,
storage reads, and uploads. Ordinary employee and administrator regression
checks pass. The untrusted `user_metadata` marker does not activate
the trusted integration restrictions.

**Scope limitation:** the replay uses simplified synthetic table definitions
and simulated Supabase Auth JWT claims, not a full Supabase stack. It
does NOT validate actual PostgREST endpoints, Auth user provisioning,
storage API behavior, bucket lifecycle, signed URLs, all 18 original
table policies, or real employee workflows. Those remain required before
live activation. The SQL remains **review-only; do not apply**.

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
