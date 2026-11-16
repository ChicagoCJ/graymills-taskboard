# Live Supabase integration-policy release gate — 2026-11-16

## Authorization and scope

User approved **only** controlled installation of proposed restrictive RLS policies in existing Graymills TaskBoard Supabase project `sxwwxeyclbduovrlvtxx`, subject to final preflight. The user did **not** authorize new Auth users, OAuth activation, employee login changes, an application merge, or a production deployment.

## Rechecked, read-only, on the live project

- Project status: `ACTIVE_HEALTHY` on PostgreSQL 17.
- 18 expected `public` tables, all with RLS enabled.
- Existing isolation policies prefixed `chatgpt_iso_`: **0**.
- Auth users marked `raw_app_meta_data.taskboard_integration = graymills_seo_readonly_v1`: **0**.
- Marked Auth users with a public profile: **0**.
- Active approved Parts Washers SEO project: **yes**.
- Existing private `task-attachments` bucket: **yes**.
- Active employee profiles: **8** (count only, no private data exported).
- `storage.objects` has three preexisting task-attachment policies; no policies were found on other selected storage metadata tables.
- Latest GitHub full Supabase Auth, PostgREST, Storage tests passed with disposable users: https://github.com/ChicagoCJ/graymills-taskboard/actions/runs/43976847576

## Gate NOT verified — production backup / restore point

The current connected Supabase tool exposes project metadata and SQL, but **does not expose the backup inventory or the latest restorable backup status**. General Supabase documentation states Pro projects normally receive daily backups, but this does not verify this specific project's last successful restorable backup. No Supabase Management API token or dashboard access was used.

**STOP: Do not apply live policy migrations until the most recent usable backup or PITR recovery point for this project is confirmed.**

Verification instructions: Supabase Dashboard → project `graymills-taskboard` → Database → Backups. Confirm a completed backup and its date/time, or an available point-in-time restore range. Do not initiate a restore. A fresh policy preflight must be repeated afterward.

## Planned change only

- `integration-rls-isolation.review.sql`: 72 new restrictive, authenticated-only policies across 18 public tables.
- `integration-storage-isolation.review.sql`: four new restrictive policies on `storage.objects`.
- Both use **administrator-controlled** `app_metadata.taskboard_integration=graymills_seo_readonly_v1`; they do not restrict employees without that marker.
- `live-rollout-rollback.review.sql`: removes only the 76 policies added for the integration; no existing policies are altered.
- After backup verification, apply a combined, transactional policy migration with lock timeout, explicit validation, and fail/rollback conditions, then read back all 76 installed policies, recheck employee RLS predicates and leave OAuth off.
- No real integration account until later approval.

## Operational status

**APPROVED CONDITIONAL; NOT APPLIED.** No new policies, accounts, projects, storage objects, deployments, or employee permissions were changed in this preflight.
