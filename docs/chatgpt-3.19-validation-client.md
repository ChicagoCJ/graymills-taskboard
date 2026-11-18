# Version 3.19 — Private MCP validation client setup

The operator command prepares the remaining OAuth client settings while both
hosted services remain disabled. No schema change or TaskBoard deployment is
needed. It uses the restricted OAuth database login and the existing dedicated
OAuth user, never a Supabase service-role key.

Run `experiments/oauth-provider/setup-introspection-client.ps1` with the approved
OAuth email/subject, downloaded CA file, restricted database host/project and
the dedicated MCP test project's Vercel identifiers. After installing pinned
dependencies, the command requests three masked values: saved database URL,
saved OAuth server secret, and the dedicated OAuth user's new login password.
Do not paste these values into chat. The process environment is restored on exit.

The local Node process verifies the Vercel project name, owner and deployment
root, then checks prerequisite settings in both Production and Preview. It stops
if any client settings already exist, so repeated calls cannot silently replace
credentials. Existing validation clients also cause a review stop.

It initializes the auth library inside the local process using the existing
issuer configuration. This starts no HTTP server and changes no hosted enable
flag. It verifies the dedicated user's password and exact subject, uses the
provider's authenticated client-registration endpoint, and checks the generated
client credentials with the real introspection endpoint. It saves the generated
secret directly through the signed-in Vercel CLI's stdin; no secret is put in
command arguments, a file, or terminal output. The CLI child does not inherit
the operator's OAuth database/password/server-secret environment variables.

The three new MCP settings are `MCP_INTROSPECTION_CLIENT_ID` (Config),
`MCP_INTROSPECTION_CLIENT_SECRET` (Secret), and `MCP_OAUTH_CLIENT_ID` (Config),
each for Production and Preview. The generated credential is used only by the
resource server to validate live sessions. It is not ChatGPT's OAuth client
secret. The command confirms all settings were saved before reporting success.

The operator saves one environment-variable object per CLI request. Vercel CLI
53.0.1's bundled `Client._fetch` serializes plain objects but leaves a top-level
array unchanged, despite the REST API accepting arrays. A bulk array therefore
fails through that CLI. The regression test requires plain-object request bodies
and preserves literal percent characters without URL-encoding credential values.

ChatGPT uses CIMD with `https://chatgpt.com/oauth/client.json`. This issuer
advertises RFC 9207 support; disposable tests verify matching issuer parameters
in successful and error authorization callbacks. OpenAI documents the stable
CIMD client ID for this callback mode:
https://developers.openai.com/plugins/build/auth

The temporary operator session is signed out after setup. If saving fails,
cleanup removes only the new validation client created by that invocation.
Partial Vercel settings may still need review; do not retry blindly or enable
either hosted service after a failure. Previously existing clients are never
deleted or rotated by this command.

CI exercises the actual registration and introspection APIs, checks hashed
secret storage, verifies identity restrictions, confirms cleanup after a save
failure, and checks that session/signing-key counts are preserved. Vercel writes
are mocked; the user-run operator command performs the live configuration.

## Hosted startup diagnostics

Auth routes keep public failures generic and write only
`TASKBOARD_OAUTH_FAILURE` plus a fixed diagnostic code to the private runtime
log. They never log an exception's message, stack, URL, inputs or configuration
values. Codes distinguish missing/rejected settings, an invalid CA, invalid
URLs, unavailable runtime modules, and database connection/permission failures.
The discovery route awaits its handler so asynchronous failures are covered.

CI additionally starts the compiled production Next.js server with disposable
loopback database settings and checks successful discovery and session routes.
No live credentials are used for that test.
