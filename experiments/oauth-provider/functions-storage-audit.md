# TaskBoard / ChatGPT OAuth — functions and Storage security audit (read-only)

Audited: 2026-11-16. Source: live Supabase catalog inspection only; **no live permissions, policies, functions, buckets or users changed**.

## Findings

### Public SQL functions

Eight functions currently exist in `public`:

| Function | SECURITY DEFINER | EXECUTE by authenticated / anon / dedicated OAuth DB role | Observation |
|---|---|---|---|
| `can_see_task(uuid)` | Yes | Yes / Yes / Yes | Uses `auth.uid()` to evaluate assignment, team, or admin/manager access; accepts arbitrary UUID, so result may disclose a Boolean about a guessed task. |
| `is_task_assignee(uuid)` | Yes | Yes / Yes / Yes | Delegates to `can_see_task`. |
| `is_active_user()` | Yes | Yes / Yes / Yes | Reads caller's profile active flag. |
| `is_admin()` | Yes | Yes / Yes / Yes | Reads caller's active admin flag. |
| `is_manager()` | Yes | Yes / Yes / Yes | Reads caller's active manager flag. |
| `is_admin_or_manager()` | Yes | Yes / Yes / Yes | Combines `is_admin` and `is_manager`. |
| `handle_new_user()` | Yes | Yes / Yes / Yes | Trigger function, inserts or updates a profile on auth.user creation; unlike a regular SQL function, PostgreSQL trigger functions cannot normally be invoked by a direct SELECT. Must still review its trigger binding and role/registration consequences before provisioning an integration Auth user. |
| `set_updated_at()` | No | Yes / Yes / Yes | Trigger function setting a timestamp. |

These seven SECURITY DEFINER functions run as `postgres`. They do **not** automatically become a data-exfiltration route merely because EXECUTE is granted: current function definitions do not return arbitrary rows or mutate arbitrary tables. However, using their Boolean results or existing triggers may have consequences and must be tested with the actual integration identity. In particular, the `can_see_task` helper ignores project boundaries; the proposed restrictive public-table RLS policies are the essential independent project-level guard.

**Release gate:** review every function callable by a newly provisioned integration member and test unexpected RPC calls. Do not blindly `REVOKE EXECUTE` from PUBLIC on live functions: existing RLS policies, triggers, and employee workflows may depend on them, and an individual role-specific revoke does not override a PUBLIC grant. Before any production change, consider stricter function-specific guards or isolating RPC exposure with a vetted API boundary and negative tests. Keep trigger functions' signatures and current employee flows intact.

### Storage bucket, policies and grants

- Exactly **one private bucket**: `task-attachments` (`public=false`).
- `storage.objects` currently has three authenticated-role policies:
  - SELECT: permitted for attachment records matching allowed task access or uploader identity.
  - INSERT: authenticated user may upload into a folder named with their `auth.uid()`.
  - DELETE: own folder or admin.
- No separate TaskBoard-specific UPDATE policy was observed. Absence of UPDATE policy generally denies UPDATE by RLS even though the SQL GRANT exists; this is not a complete integration-specific guard for future policies.
- Authenticated has SQL privileges on `storage.objects` and selected other Supabase-managed `storage` tables. Storage is **not** covered by the 18-table `public` RLS fixture.
- `storage` functions callable by authenticated exist; the inspected functions are not SECURITY DEFINER, but must be evaluated in the context of actual Storage API behavior.
- Published attachment URLs and signed URL issuance must also be checked during end-to-end validation. `storage.objects` RLS does not revoke a previously issued signed URL.

### Private OAuth schema

Twelve `chatgpt_oauth` tables have RLS enabled and are not granted to `authenticated`. The restricted `chatgpt_oauth_runtime` **PostgreSQL** login remains distinct from the future dedicated **Supabase Auth** integration Member.

## Changes committed to the development branch (not applied)

1. `integration-rls-isolation.review.sql`: proposed 72 restrictive policies covering all 18 current public tables, denying integration writes and narrowing project/task/profile reads.
2. `integration-storage-isolation.review.sql`: proposed four restrictive policies covering SELECT, INSERT, UPDATE and DELETE on `storage.objects` for the same test identity. Employees remain governed by their preexisting permissive policies.
3. `verify-integration-rls.mjs`: disposable PostgreSQL test of both SQL proposals, including own-folder upload attempt, attachment SELECT/UPDATE/DELETE, identity separation, SEO-only reads, no task writes, role escalation attempt and employee regression checks.

These fixtures simulate existing policies. **They do not replicate every live Supabase RLS, trigger, API or Storage behavior.** Do not assume passing mock tests alone establishes live security.

## Remaining mandatory checks before live provisioning

- Confirm an approved, fixed integration identity / Auth user UUID, its profile role, whether the `handle_new_user` trigger creates an active Member, and the exact need for assignment to the SEO project's tasks.
- Reconcile restrictive policies with real current `public` and Supabase-managed `storage` policies in a safe production-like staging environment. No bypass via RPC, signed URLs, `storage.buckets` metadata or new objects.
- Inventory Supabase Auth admin/API operations and bucket management; ensure dedicated user credentials never gain administrative access or bypass RLS.
- Test direct Supabase REST/Storage requests for unrelated project/task/attachment data and every mutation; test normal employee behavior as regression.
- Run Supabase Security and Performance Advisors and review before applying migrations.
- Only with explicit approval should production RLS and identity provisioning be attempted. Until then, OAuth-to-MCP remains disabled and PR #1 remains unmerged.
