# Reviewed email tasks — production release

This release ports only the existing reviewed-email task UI onto the production branch. The main site's Next.js version remains 16.2.6. It adds Zod for draft validation and JSDOM for component tests. No OAuth prototype, MCP route, database policy, or migration is included.

## Behavior

The normal TaskBoard site at https://graymills-taskboard.vercel.app accepts an email-task draft in a browser fragment. After the existing TaskBoard sign-in completes, the review opens automatically and removes the fragment from the current address. Owner, team, project, status, priority, due date, reminders, title, notes, and source remain editable. No task is saved before confirmation.

Quick Add and email review begin collapsed. Users can show/hide them without losing their draft. Hiding email review clears confirmation. Creation uses the signed-in user's existing Supabase session and existing RLS. The source email link is preserved in the task description. Task/assignment/attachment writes remain separate operations; partial success is reported with the existing task ID rather than offering duplicate creation.

## Outlook destination

The separate Outlook add-in is hosted at https://graymills-taskboard-outlook-test.vercel.app. Its source is maintained on feature/email-task-review, with its destination changed to the normal TaskBoard URL after this release is ready. The installed pilot's existing branch alias will also forward its root page to the main site, preserving the email draft fragment through normal HTTP redirect semantics (RFC 9110, section 10.2.2). This compatibility redirect belongs to the pilot branch, not production. Unique preview deployment URLs continue serving previews for QA.

Supabase browser sessions are scoped to the site's browser storage. Returning to the same TaskBoard address in the same browser profile can reuse an existing valid session; a different browser/profile or an expired session still requires ordinary sign-in. No credentials or sessions are copied between origins.

## Validation and rollback

Run npm run test:email-review, focused ESLint on the new component/model/tests, and the Next.js production build with inert public Supabase placeholders. The eight component/contract tests cover confirmation, missing selections, source retention, link loading, show/hide state, double submission, and retry IDs. Actual task creation is not performed by automated checks.

The existing page's unrelated lint findings remain outside this release. Rollback uses the previous main deployment; there are no database changes to undo.
