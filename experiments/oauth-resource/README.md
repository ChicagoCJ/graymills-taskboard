# Version 3.19 — isolated OAuth MCP resource

Prepared for review; **not deployed or activated**. This Next.js app is a
separate deployment root. It is not imported by the TaskBoard application.
The already-tested TaskBoard Supabase-bearer routes and employee login are unchanged.

## Behavior

- All MCP requests and discovery return 503 unless `MCP_OAUTH_ENABLED=true`
  and every required setting is present and consistent with the request origin.
- Accept only signed, session-bound OAuth **access** JWTs, with the approved
  issuer, resource audience, client, subject, `at+jwt` header, `openid` scope,
  and maximum five-minute lifetime. Ordinary Supabase bearer sessions, session
  JWTs, missing tokens, cookie-only requests and DPoP-bound tokens are rejected.
- Check active-session/client state through the issuer's authenticated
  introspection endpoint on **every request**, before Supabase credentials
  are used. An outage fails closed. JWT signature validation alone does not
  provide revocation checks.
- Sign into Supabase on the backend using only the dedicated `sales@graymills.com`
  account. Verify its server-confirmed UUID and protected metadata marker,
  its own active Member profile and the approved SEO project.
- Pin the existing Supabase origin, integration UUID and SEO project UUID in
  `config.ts`. Caller arguments cannot change them. Query using the resulting
  Supabase user session so that the installed RLS policies continue to apply.
- Expose only `seo_project`, `seo_tasks`, `seo_task`; no data-write tools,
  comments, files or other projects. Nonarchived tasks remain limited to
  assignments visible to the Member and a maximum of 100 list results.
- Do not return Supabase tokens, password, introspection credentials or raw
  upstream errors. Network requests use timeouts, no caching and no redirects.

## Server-only settings

| Setting | Purpose |
| --- | --- |
| `MCP_OAUTH_ENABLED` | Leave absent/false until the activation gate is approved |
| `MCP_PUBLIC_RESOURCE` | Exact stable HTTPS resource URL ending `/api/integrations/chatgpt/mcp` |
| `MCP_OAUTH_ISSUER` | Separate authorization server's exact HTTPS issuer ending `/api/auth` |
| `MCP_OAUTH_CLIENT_ID` | Approved ChatGPT OAuth client/CIMD identity |
| `MCP_OAUTH_SUBJECT` | Separately provisioned Better Auth user ID, not a Supabase UUID |
| `MCP_INTROSPECTION_CLIENT_ID` | Confidential resource client linked to this resource |
| `MCP_INTROSPECTION_CLIENT_SECRET` | That client's server-only secret |
| `MCP_SUPABASE_PUBLISHABLE_KEY` | Existing project's publishable key; secret/service-role keys refused |
| `MCP_SUPABASE_PASSWORD` | Dedicated restricted account password, never an employee password |

Store secrets directly in the dedicated Vercel project's server environment.
Never copy them into ChatGPT, source control, client code, screenshots or logs.
Do not copy TaskBoard's production environment wholesale.

The issuer must issue five-minute tokens and register this resource client with
`token_endpoint_auth_method=client_secret_post` and the resource link required
for RFC 7662 introspection. A separate confidential client is needed; the
public ChatGPT client must never receive or share its secret.

## Verification

`npm ci --ignore-scripts`, `npm test`, `npm run check`, `npm run build`.
Eleven automated test groups exercise actual signed test JWTs and the MCP SDK.
All network calls in this suite are intercepted: no live credentials, customer
data, OAuth database or Supabase writes are used. This does **not** establish
an end-to-end ChatGPT sign-in or real hosted issuer/resource communication.

The separate provider's CI tests issue a real disposable PKCE token and test
confidential-client introspection before/after sign-out. The workflow also
starts the built resource without configuration and checks its HTTP 503 state.

See `../../docs/chatgpt-3.19-oauth-connector.md` for release gates and the
completed live operator-test evidence. This service has no automatic migrations,
public signup or activation script.
