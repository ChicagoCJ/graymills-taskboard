# Live Supabase RLS isolation installation — 2026-11-16

## Authorization and backup check

User explicitly approved the controlled live Supabase security-policy installation following final preflight. A user-provided Supabase Dashboard screenshot showed the production `graymills-taskboard` Scheduled Backups page and a **2026-11-16 physical backup** with Restore available, along with backups from previous days. No restoration was initiated. Backup verification was visual; backup integrity was not independently tested.

## Applied successfully

Existing Supabase project: `sxwwxeyclbduovrlvtxx` (`graymills-taskboard`, production).

Migration name: `chatgpt_seo_integration_readonly_rls_isolation_20261116`  
Supabase migration version: `20261116232848`

The migration was applied using the Supabase `apply_migration` DDL tool and reported `success: true`. It installed:
- **72 RESTRICTIVE policies** on **18 public tables** (SELECT, INSERT, UPDATE, DELETE per table).
- **4 RESTRICTIVE policies** on `storage.objects` (SELECT, INSERT, UPDATE, DELETE).
- All policies are scoped to the `authenticated` database role, with guards for the administrator-controlled `app_metadata.taskboard_integration = graymills_seo_readonly_v1` marker.
- SELECT is narrowed to the active approved SEO project, active own Member profile, and nonarchived approved-project tasks, combined with existing permissive RLS.
- Writes for marked integration JWTs are denied; Storage object access for marked integration JWTs is denied.
- No old RLS policies, table schemas, employee profiles, or storage objects were modified by the migration.

## Live post-migration verification

Independent SQL queries verified:
- 18 public SELECT, 18 public INSERT, 18 public UPDATE, 18 public DELETE restrictive policies.
- 1 Storage SELECT, 1 Storage INSERT, 1 Storage UPDATE, 1 Storage DELETE restrictive policies.
- **76 total**, all `RESTRICTIVE`.
- Supabase migration record exists.
- Auth user accounts with integration marker: **zero**.
- Active employee profiles: **eight**, unchanged from the pre-install baseline.
- Simulated marked `authenticated` request (read-only transaction with `SET LOCAL ROLE authenticated` and mock JWT claims): **one visible SEO project, zero visible profiles, zero visible Storage objects, zero task comments**. Zero profiles is expected because the test UUID has no real user profile.
- Simulated unmarked `authenticated` request (read-only transaction rolled back): **five visible active projects**, matching the five active projects in the baseline.
- The post-migration Supabase Security Advisor continues to report the same pre-existing warnings involving seven SECURITY DEFINER functions, mutable function search path, and Auth leaked-password protection. No new warning class observed.

**Limitations:** No real marked Supabase Auth user exists yet, so no live signed-in account has undergone these policies. Existing employees were not impersonated. The simulated unmarked test and static policy check support expected compatibility, but do not replace employee login regression checks. No end-to-end ChatGPT/OAuth connection test was performed.

## Intentionally not done

- No real integration Auth account created, no live credentials generated.
- No OAuth test deployment activated, no MCP resource bridge connected, no Vercel production change.
- No GitHub PR merged, no application production deployment.
- No changes to existing employee accounts, permissions, stored task records, or files.

## Next gate

Explicitly authorize creation of a dedicated Supabase Auth integration user (with trusted server-controlled app_metadata marker), secure Preview-only credential provisioning, and real signed-in API negative tests. Review Auth lifecycle, revocation, actual user UUID and profile, SEO task visibility, RPC and Storage behavior, and employee regression before enabling OAuth.

**Rollback** if required and separately approved: `experiments/oauth-provider/live-rollout-rollback.review.sql`. The SQL removes only these 76 `chatgpt_iso_` policies. Do not roll back policies while an integration account is active: disable the bridge, revoke sessions, and ensure account is deactivated first.
