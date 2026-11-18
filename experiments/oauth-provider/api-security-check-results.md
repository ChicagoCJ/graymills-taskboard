# Supabase Auth, REST, and Storage API checks — 2026-11-16

**GitHub Actions run:** https://github.com/ChicagoCJ/graymills-taskboard/actions/runs/43975912435 — both jobs PASS.

## Verified with real live Supabase endpoints, without credentials

Script: `verify-live-unauthenticated-api.mjs`. Issues **GET only**, sends no API key or token, and sends no mutations. Tested the existing API endpoint `https://sxwwxeyclbduovrlvtxx.supabase.co`:

- Supabase Auth `GET /auth/v1/user`: HTTP 401, denied.
- PostgREST `GET /rest/v1/projects?select=id&limit=1`: HTTP 401, denied.
- Private Storage object `GET /storage/v1/object/authenticated/task-attachments/__chatgpt_nonexistent_readonly_probe__`: HTTP 400 missing-key rejection, no file returned.
- Storage bucket metadata `GET /storage/v1/bucket/task-attachments`: denied (test expects 400/401/403).

A missing-API-key error is a **negative control**, not a demonstration that valid anonymous credentials, Auth Members or OAuth users are scoped correctly.

## Verified with real PostgREST HTTP over disposable PostgreSQL

Scripts: `verify-live-core-policy-replay.mjs` and
`verify-postgrest-http.mjs`. Uses a real PostgREST 12.2.8 server and
a disposable PostgreSQL database populated solely with synthetic records,
the read-only snapshot of 21 actual TaskBoard policies and six functions,
plus the proposed restrictive policies.

Passing checks:
- Signed synthetic integration JWT with trusted `app_metadata` sees only SEO project and task.
- Signed Member JWT (without trusted marker) retains normal assigned-task access.
- Forged `user_metadata` does not activate the trusted marker.
- Integration cannot PATCH, DELETE or POST TaskBoard tasks via REST.
- Member's normal assigned-task PATCH still works.
- Tampered JWT rejected with HTTP 401.

## Not verified, and required before activation

- **Real Supabase Auth sign-in** for a dedicated integration Member. No such account has been created, and doing so before installing verified restrictions could create overbroad live access due to the user-creation trigger.
- **Authenticated requests to the real Supabase Storage HTTP API**, including upload, overwrite, delete, signed URL and bucket-metadata access. SQL-level disposable Storage policies passed, but a real Supabase Storage API integration test did not run.
- **Real production post-migration negative tests**, direct RPC function calls, Auth account/revocation lifecycle, signed OAuth token to MCP integration.
- Full live policy/schema parity beyond the core replay.

Do not interpret the successful API checks as approval to install reviewed SQL. The remaining steps need a production-like full Supabase service stack, tested migration, and explicit authorization before any shared-database changes. Leave OAuth disabled, PR unmerged and production untouched.
