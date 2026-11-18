-- TaskBoard 3.17R: independent Better Auth database identity.
-- Only touches newly created chatgpt_oauth schema and a new dedicated role.
-- No new Supabase project, no change to existing TaskBoard users/tables/policies.
-- This role has LOGIN but NO PASSWORD until server-only secrets are provisioned.
-- Never set a password in source control or migration logs.

create role chatgpt_oauth_runtime
  with login noinherit nosuperuser nocreatedb nocreaterole
  noreplication nobypassrls connection limit 3 password null;

-- A preferred search path is convenience, NOT a permission boundary.
alter role chatgpt_oauth_runtime set search_path to chatgpt_oauth, pg_catalog;

grant usage on schema chatgpt_oauth to chatgpt_oauth_runtime;
grant select, insert, update, delete on all tables in schema chatgpt_oauth
  to chatgpt_oauth_runtime;

-- RLS is already enabled on all 12 tables; no broad PUBLIC policies.
-- Permit only this named login to operate on the dedicated auth tables.
create policy "oauth_runtime_only" on "chatgpt_oauth"."user"
  for all to chatgpt_oauth_runtime using (true) with check (true);

create policy "oauth_runtime_only" on "chatgpt_oauth"."session"
  for all to chatgpt_oauth_runtime using (true) with check (true);

create policy "oauth_runtime_only" on "chatgpt_oauth"."account"
  for all to chatgpt_oauth_runtime using (true) with check (true);

create policy "oauth_runtime_only" on "chatgpt_oauth"."verification"
  for all to chatgpt_oauth_runtime using (true) with check (true);

create policy "oauth_runtime_only" on "chatgpt_oauth"."jwks"
  for all to chatgpt_oauth_runtime using (true) with check (true);

create policy "oauth_runtime_only" on "chatgpt_oauth"."oauthClient"
  for all to chatgpt_oauth_runtime using (true) with check (true);

create policy "oauth_runtime_only" on "chatgpt_oauth"."oauthResource"
  for all to chatgpt_oauth_runtime using (true) with check (true);

create policy "oauth_runtime_only" on "chatgpt_oauth"."oauthClientResource"
  for all to chatgpt_oauth_runtime using (true) with check (true);

create policy "oauth_runtime_only" on "chatgpt_oauth"."oauthRefreshToken"
  for all to chatgpt_oauth_runtime using (true) with check (true);

create policy "oauth_runtime_only" on "chatgpt_oauth"."oauthAccessToken"
  for all to chatgpt_oauth_runtime using (true) with check (true);

create policy "oauth_runtime_only" on "chatgpt_oauth"."oauthConsent"
  for all to chatgpt_oauth_runtime using (true) with check (true);

create policy "oauth_runtime_only" on "chatgpt_oauth"."oauthClientAssertion"
  for all to chatgpt_oauth_runtime using (true) with check (true);

-- No default grants: any new Better Auth tables fail closed until reviewed.
-- Do not make this role owner or give BYPASSRLS/CREATEROLE/SUPERUSER.
