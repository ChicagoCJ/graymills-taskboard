-- TaskBoard 3.17 / Better Auth 1.7.18, schema reviewed 2026-11-10.
-- Generated in disposable GitHub Actions PostgreSQL 17 and validated there.
-- Live changes: ONLY new schema chatgpt_oauth, 12 tables, 18 indexes, and
-- access restrictions. NO existing TaskBoard or Supabase Auth table changes.
-- All OAuth signup, login, and token issuance remain disabled in production.

create schema if not exists "chatgpt_oauth";

create table "chatgpt_oauth"."user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create table "chatgpt_oauth"."session" ("id" text not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" text not null references "chatgpt_oauth"."user" ("id") on delete cascade);

create table "chatgpt_oauth"."account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "chatgpt_oauth"."user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);

create table "chatgpt_oauth"."verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create table "chatgpt_oauth"."jwks" ("id" text not null primary key, "publicKey" text not null, "privateKey" text not null, "createdAt" timestamptz not null, "expiresAt" timestamptz, "alg" text, "crv" text);

create table "chatgpt_oauth"."oauthClient" ("id" text not null primary key, "clientId" text not null unique, "clientSecret" text, "clientDiscoveryId" text, "disabled" boolean, "skipConsent" boolean, "enableEndSession" boolean, "subjectType" text, "scopes" jsonb, "clientCredentialsScopes" jsonb, "userId" text references "chatgpt_oauth"."user" ("id") on delete cascade, "createdAt" timestamptz, "updatedAt" timestamptz, "name" text, "uri" text, "icon" text, "contacts" jsonb, "tos" text, "policy" text, "softwareId" text, "softwareVersion" text, "softwareStatement" text, "redirectUris" jsonb not null, "postLogoutRedirectUris" jsonb, "backchannelLogoutUri" text, "backchannelLogoutSessionRequired" boolean, "tokenEndpointAuthMethod" text, "applicationType" text, "jwks" text, "jwksUri" text, "grantTypes" jsonb, "responseTypes" jsonb, "requirePKCE" boolean, "dpopBoundAccessTokens" boolean, "referenceId" text, "metadata" jsonb);

create table "chatgpt_oauth"."oauthResource" ("id" text not null primary key, "identifier" text not null unique, "name" text not null, "accessTokenTtl" integer, "refreshTokenTtl" integer, "signingAlgorithm" text, "signingKeyId" text, "allowedScopes" jsonb, "customClaims" jsonb, "dpopBoundAccessTokensRequired" boolean, "disabled" boolean, "createdAt" timestamptz, "updatedAt" timestamptz, "policyVersion" integer, "metadata" jsonb);

create table "chatgpt_oauth"."oauthClientResource" ("id" text not null primary key, "clientId" text not null references "chatgpt_oauth"."oauthClient" ("clientId") on delete cascade, "resourceId" text not null references "chatgpt_oauth"."oauthResource" ("identifier") on delete cascade, "metadata" jsonb, "createdAt" timestamptz);

create table "chatgpt_oauth"."oauthRefreshToken" ("id" text not null primary key, "token" text not null unique, "clientId" text not null references "chatgpt_oauth"."oauthClient" ("clientId") on delete cascade, "sessionId" text references "chatgpt_oauth"."session" ("id") on delete set null, "userId" text not null references "chatgpt_oauth"."user" ("id") on delete cascade, "referenceId" text, "authorizationCodeId" text, "resources" jsonb, "requestedUserInfoClaims" jsonb, "expiresAt" timestamptz not null, "createdAt" timestamptz not null, "revoked" timestamptz, "rotatedAt" timestamptz, "rotationReplayResponse" text, "rotationReplayExpiresAt" timestamptz, "authTime" timestamptz, "confirmation" jsonb, "scopes" jsonb not null);

create table "chatgpt_oauth"."oauthAccessToken" ("id" text not null primary key, "token" text not null unique, "clientId" text not null references "chatgpt_oauth"."oauthClient" ("clientId") on delete cascade, "sessionId" text references "chatgpt_oauth"."session" ("id") on delete set null, "userId" text references "chatgpt_oauth"."user" ("id") on delete cascade, "referenceId" text, "authorizationCodeId" text, "resources" jsonb, "requestedUserInfoClaims" jsonb, "refreshId" text references "chatgpt_oauth"."oauthRefreshToken" ("id") on delete cascade, "expiresAt" timestamptz not null, "createdAt" timestamptz not null, "revoked" timestamptz, "confirmation" jsonb, "scopes" jsonb not null);

create table "chatgpt_oauth"."oauthConsent" ("id" text not null primary key, "clientId" text not null references "chatgpt_oauth"."oauthClient" ("clientId") on delete cascade, "userId" text references "chatgpt_oauth"."user" ("id") on delete cascade, "referenceId" text, "resources" jsonb, "requestedUserInfoClaims" jsonb, "scopes" jsonb not null, "createdAt" timestamptz not null, "updatedAt" timestamptz not null);

create table "chatgpt_oauth"."oauthClientAssertion" ("id" text not null primary key, "expiresAt" timestamptz not null);

create index "session_userId_idx" on "chatgpt_oauth"."session" ("userId");

create index "account_userId_idx" on "chatgpt_oauth"."account" ("userId");

create index "verification_identifier_idx" on "chatgpt_oauth"."verification" ("identifier");

create index "oauthClient_userId_idx" on "chatgpt_oauth"."oauthClient" ("userId");

create index "oauthClientResource_clientId_idx" on "chatgpt_oauth"."oauthClientResource" ("clientId");

create index "oauthClientResource_resourceId_idx" on "chatgpt_oauth"."oauthClientResource" ("resourceId");

create index "oauthRefreshToken_clientId_idx" on "chatgpt_oauth"."oauthRefreshToken" ("clientId");

create index "oauthRefreshToken_sessionId_idx" on "chatgpt_oauth"."oauthRefreshToken" ("sessionId");

create index "oauthRefreshToken_userId_idx" on "chatgpt_oauth"."oauthRefreshToken" ("userId");

create index "oauthRefreshToken_authorizationCodeId_idx" on "chatgpt_oauth"."oauthRefreshToken" ("authorizationCodeId");

create index "oauthAccessToken_clientId_idx" on "chatgpt_oauth"."oauthAccessToken" ("clientId");

create index "oauthAccessToken_sessionId_idx" on "chatgpt_oauth"."oauthAccessToken" ("sessionId");

create index "oauthAccessToken_userId_idx" on "chatgpt_oauth"."oauthAccessToken" ("userId");

create index "oauthAccessToken_authorizationCodeId_idx" on "chatgpt_oauth"."oauthAccessToken" ("authorizationCodeId");

create index "oauthAccessToken_refreshId_idx" on "chatgpt_oauth"."oauthAccessToken" ("refreshId");

create index "oauthConsent_clientId_idx" on "chatgpt_oauth"."oauthConsent" ("clientId");

create index "oauthConsent_userId_idx" on "chatgpt_oauth"."oauthConsent" ("userId");

create unique index "oauthClientResource_clientId_resourceId_uidx" on "chatgpt_oauth"."oauthClientResource" ("clientId", "resourceId");

-- These objects are not exposed by the Supabase Data API. No client role
-- receives privileges on this schema or its tables.
revoke all on schema "chatgpt_oauth" from PUBLIC, anon, authenticated, authenticator, service_role;
revoke all on all tables in schema "chatgpt_oauth" from PUBLIC, anon, authenticated, authenticator, service_role;

-- Defense in depth. No RLS policies are added here: access is deliberately
-- closed until a dedicated, least-privilege server identity is reviewed.
alter table "chatgpt_oauth"."user" enable row level security;
alter table "chatgpt_oauth"."session" enable row level security;
alter table "chatgpt_oauth"."account" enable row level security;
alter table "chatgpt_oauth"."verification" enable row level security;
alter table "chatgpt_oauth"."jwks" enable row level security;
alter table "chatgpt_oauth"."oauthClient" enable row level security;
alter table "chatgpt_oauth"."oauthResource" enable row level security;
alter table "chatgpt_oauth"."oauthClientResource" enable row level security;
alter table "chatgpt_oauth"."oauthRefreshToken" enable row level security;
alter table "chatgpt_oauth"."oauthAccessToken" enable row level security;
alter table "chatgpt_oauth"."oauthConsent" enable row level security;
alter table "chatgpt_oauth"."oauthClientAssertion" enable row level security;

-- Future tables also get no direct access from Supabase client roles.
alter default privileges in schema "chatgpt_oauth"
  revoke all on tables from PUBLIC, anon, authenticated, authenticator, service_role;
