# Version 3.19 — Prepare the isolated OAuth connector

Status: code prepared for testing on `feature/taskboard-3.16a-readonly`.
OAuth remains disabled. No production deployment, new subscription or new
database migration is part of this revision.

This note supplements the earlier architecture/rollout notes. Their statements
that no integration account or RLS policies exist are historical, superseded
by the 2026-11-16 installation record and the operator results below.

## Problem and resulting behavior

The working TaskBoard endpoint accepts Supabase session tokens. Better Auth
OAuth access tokens are a different identity and cannot be passed straight
to Supabase. A separate resource app now verifies OAuth, checks live session
state, then opens a backend-only session as the restricted integration Member.
The original TaskBoard endpoint and employee login remain intact.

The new resource lives at `experiments/oauth-resource`. Its default is HTTP
503 for both MCP and discovery. Merely deploying the code does not activate
sign-in or grant ChatGPT access. The existing authorization prototype now
issues five-minute tokens compatible with the resource's lifetime limit.
Both isolated packages have committed dependency lockfiles.

## Operator evidence — November 16–17, 2026

Reported by the operator, rather than independently executed by this agent:

| Check | Result / limit |
| --- | --- |
| Real restricted Auth account | `90550275-5ffc-434f-bc46-41026ca7ba26`, `sales@graymills.com`, confirmed email |
| Protected app_metadata | `taskboard_integration=graymills_seo_readonly_v1` |
| Signed-in project read | Exactly approved project `22eacfd8-22f8-4c01-a51d-44987facad42` |
| Own profile | Active Member; no other profile reported visible |
| Task assignment | New account added to test task `640941f3-bab6-414c-b50f-294f61526aea`; existing assignment retained |
| Signed-in task read | That one nonarchived SEO test task visible |
| Other projects/tasks and comments | Direct authenticated REST queries returned no rows |
| Task update | Simulated authenticated SQL transaction: one visible task, zero updated rows; rolled back. This was not an HTTP write test |
| Restrictive policies inspected | INSERT/UPDATE/DELETE guards on projects, tasks and profiles reject the trusted integration marker |
| Known private attachment | Valid restricted session could not obtain a signed URL; Storage returned 400/404 NoSuchKey |
| Role RPCs | Active true; admin, manager and admin-or-manager false |
| Normal user regression | Operator reported normal project/task/comments/attachment access; not every employee role tested |
| Authenticated Vercel preview | Correct SEO project returned via original Supabase-bearer endpoint |
| MCP initialize/tools/read | Initialized; exactly seo_project/seo_tasks/seo_task; correct test task returned |
| MCP other-project lookup | Rejected real unrelated task `069f5075-2895-44d6-a603-0cd9aac4fc1f` |

The preview was rebuilt from `276b7cd` with its integration-user environment
setting updated to the new UUID. The root app remains on the existing feature
branch; no main merge or TaskBoard production promotion occurred.

Operator tooling lessons: Windows PowerShell must use `vercel.cmd` to preserve
the `--` separator; the successful CLI was 53.0.1. Supabase sessions need
refresh after expiry. MCP responses may be JSON or event-stream `data:` frames.
The initial cross-project failure was a PowerShell response-wrapper parsing
error, not evidence of leaked task data. Several 401 results were inconclusive
until the sign-in session was refreshed and the tests passed.

## Implementation and validation

- Separate runtime configuration and origin checks; no credentials loaded at build.
- OAuth signature/issuer/audience/type/client/subject/scope/session/lifetime checks.
- Mandatory confidential-client introspection before any Supabase credentials.
- Fixed account/project/origin, protected marker and active Member checks.
- Read-only MCP tools, strict caller schemas and explicit response field allowlists.
- Fail-closed automated test groups and a separate CI build/smoke-test job.
- Existing issuer CI now also tests real confidential-resource introspection and
  session termination, in its disposable database; no live records are used.

## Next proposed deployment — requires approval

Create two separate test services in the existing Vercel account:

| Proposed project | Repository root | Initial state |
| --- | --- | --- |
| `graymills-chatgpt-auth-test` | `experiments/oauth-provider` | No credentials or enable flag; auth/discovery unavailable |
| `graymills-chatgpt-mcp-test` | `experiments/oauth-resource` | No credentials or enable flag; MCP/discovery HTTP 503 |

Use the exact reviewed feature commit. These services need stable, publicly
reachable HTTPS URLs for OAuth discovery and callback tests. Any visibility
change must apply only to these dedicated test projects; preserve TaskBoard's
existing deployment protection. No automation bypass link/secret is a ChatGPT
connection method. Do not create paid resources or change subscriptions.

After disabled-host verification, a separate configuration/activation gate must:

1. Securely provision the already-approved restricted OAuth runtime database
   login's password with verified TLS, storing it only in the issuer environment.
   Reuse the existing private `chatgpt_oauth` schema; do not migrate public tables.
2. Provision one dedicated Better Auth login through a reviewed server-only
   method, with no public signup and no employee-account reuse.
3. Verify ChatGPT's actual client/redirect registration requirements; approve
   exact callback metadata and resource binding. Keep public DCR disabled.
   Official OpenAI documentation supports CIMD (preferred) or a predefined
   client. The exact client URL/redirect must be copied from the actual
   connection setup; do not guess a callback ID or weaken redirect matching.
4. Register the separate confidential introspection client linked to the resource.
5. Configure server secrets, approved issuer/resource/client/subject, and the
   restricted Supabase password without printing or sharing credentials.
6. Test hosted signature/JWKS, consent, refresh, ended-session and disabled-client
   behavior, wrong claims, Supabase marker removal and cross-project rejection.
7. Obtain activation approval, then perform the actual ChatGPT browser sign-in
   and an SEO lookup. Operator token tests do not substitute for that final test.

No connector is yet configured in ChatGPT. Task assignment visibility and the
100-task cap remain material limits. Live HTTP INSERT/DELETE/storage-upload
negative tests and regression across all employee roles are not claimed complete.

Reference checked November 17, 2026:
https://developers.openai.com/plugins/build/auth — resource discovery, per-tool
OAuth declarations, S256 PKCE, CIMD and exact issuer/redirect matching.

## Rollback

For these code-only changes: revert the revision on the feature branch.
For a future dedicated deployment: unset its enable flag, revoke its OAuth
sessions/client and replace/revoke its server credentials as appropriate.
Do not remove shared RLS restrictions while the integration account is active.
No change to TaskBoard production is needed to disable the separate connector.
