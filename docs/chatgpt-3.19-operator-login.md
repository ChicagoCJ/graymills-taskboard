# Version 3.19 — Private OAuth login preparation

The local operator helper prepares one login in the existing private OAuth
schema while the independent auth and resource services remain disabled. No
schema migration, public signup endpoint, TaskBoard user or Supabase Auth user
is changed. There is no service-role key in this flow.

Run `experiments/oauth-provider/setup-operator-login.ps1` with the approved
email, session-pooler host and project reference. It installs the pinned provider
dependencies before prompting. Enter the saved restricted-role database URL
and a separately saved OAuth password only at the masked prompts. Values are
passed through the local child process environment, never command arguments,
source files or terminal output. The helper restores the prior process
environment on exit. Do not paste secrets into chat.

The Node helper verifies the database URL, requires the exact restricted-role
identity and verifies TLS certificates. Within one transaction it serializes
setup attempts, checks for existing identities, and inserts one user and one
credential account using Better Auth's installed password hasher. Email is not
marked verified. On error it rolls back; it never resets an existing password.
A repeat with the same email and matching password returns the existing OAuth
subject. Any other existing identity requires review.

The result is the private OAuth subject identifier, not a Supabase Auth user ID.
Keep the new password in a password manager. This helper neither deploys nor
activates services, creates OAuth clients, or connects ChatGPT. Those remain
separate steps.

The disposable PostgreSQL test verifies restricted-role enforcement, hashed
credential creation, matching repeat calls, rejection of mismatched passwords
and unexpected identities, and rollback of all fixtures. URL tests reject
administrative logins, other projects, other databases and transaction-pooler
ports. The existing permission tests cover public and Supabase Auth isolation.

## Hosted database certificate

The hosted auth service also needs `OAUTH_DATABASE_CA_CERT`: the complete PEM
contents of the CA certificate downloaded from the approved Supabase project's
Database Settings / SSL Configuration. Configure it in both test-project
deployment environments while keeping `OAUTH_DEPLOY_ENABLED=false`.

The hosted pool supplies this CA explicitly with certificate and hostname
verification enabled. Connection-string query parameters cannot override that
policy. A missing, malformed, expired or non-CA certificate prevents startup of
authentication. The local TLS fixture verifies trusted connections and rejection
of untrusted certificates and hostname mismatches, without a live database.

For local operator setup, point `NODE_EXTRA_CA_CERTS` to the downloaded PEM file
before starting Node; `NODE_USE_SYSTEM_CA=1` may additionally load the Windows
trust store. Restore the prior process environment after setup. Never disable
certificate verification to work around a trust error.
