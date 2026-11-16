# Isolated full Supabase Auth / REST / Storage API test — 2026-11-16

**Result: PASS.** GitHub Actions run:
https://github.com/ChicagoCJ/graymills-taskboard/actions/runs/43976847576

All three jobs succeeded:
- TypeScript / Next.js development build — PASS.
- Existing isolated OAuth prototype tests — PASS.
- **New local Supabase Auth + Storage API security job — PASS.**

The new full-stack job, using Supabase CLI `2.79.0` in a fresh GitHub runner, created its **own disposable Supabase local stack** and shut it down afterward. Neither the existing Graymills Supabase project nor production TaskBoard was changed. Local-only credentials/keys and synthetic email addresses were used and not placed in the Git repository.

## What was actually verified

- A new GoTrue Supabase Auth user with administrator-controlled `app_metadata.taskboard_integration=graymills_seo_readonly_v1` can be created **after** the review SQL installs restrictive policies.
- The local clone of the observed `on_auth_user_created` trigger creates an active `member` profile for new Auth users.
- Real local Auth password sign-in returns an authenticated token; `GET /auth/v1/user` verifies the integration's identity and trusted metadata.
- Real local PostgREST restricts that user to the single approved Parts Washers SEO project, its own profile and its assigned non-archived SEO task; unrelated tasks are not visible.
- Real local PostgREST rejects integration INSERT, UPDATE and DELETE of tasks; an ordinary Member retains access to both synthetic assigned projects and can update an assigned task.
- A normal Member can upload a file into its own folder in a private local `task-attachments` bucket; the marked integration cannot upload, overwrite, download, create a signed URL or delete an attachment.
- Forging trusted integration metadata through editable `user_metadata` does not change protected `app_metadata`.
- Existing disposable PostgreSQL RLS replay, OAuth tests, build checks, and live unauthenticated GET checks passed independently.

**All user identities, files, tasks, and credentials were synthetic.** The only live Supabase queries in this workstream remain read-only inventory/preflight queries and no-key GET negative controls.

## Known differences from the live project

- The local stack uses minimal synthetic table definitions and copies the **actual 21 core RLS policy expressions and six authorization helper functions** from the existing project; it does not reproduce every live table column, all policies on the other 14 public tables, all production triggers, all Storage metadata, or the complete live user directory.
- The attachment-bucket implementation is real Supabase Storage HTTP, but synthetic attachments and test file paths are used, not production files.
- The live shared database's proposed restrictive policies have **not** been installed. No real Supabase integration Auth Member has been created.
- The separate Better Auth OAuth issuer and TaskBoard MCP resource are **not** connected in an end-to-end ChatGPT browser authorization flow. Real OAuth client registration, revocation, invalid-token and consent behavior are further release gates.
- Any eventual production changes require a fresh preflight, an approved change window, audited policy changes and rollback readiness, employee regression verification and explicit authorization.

## Source files

- `prepare-local-supabase-api.mjs`: local-only database safety gate, original policy replay, synthetic profile trigger and private Storage bucket.
- `verify-local-supabase-auth-storage.mjs`: actual local Auth, REST and Storage HTTP integration tests.
- `.github/workflows/taskboard-preview-checks.yml`: three independent GitHub jobs, including a local Supabase full-stack job.
- `live-rollout-plan.md`: controlled live activation plan; remains NOT APPROVED.

**Go/no-go:** Local Auth/REST/Storage test gate PASSED. Production RLS migration, real integration account, and OAuth activation remain NOT APPROVED and NOT EXECUTED.
