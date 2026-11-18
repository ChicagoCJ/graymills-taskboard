import assert from "node:assert/strict";
import { Client } from "pg";
import { verifyPassword } from "better-auth/crypto";
import { hostedOperatorDatabaseUrl, prepareOperatorLogin } from "./operator-login.mjs";

const endpoint = new URL(process.env.OAUTH_TEST_DATABASE_URL ?? "invalid:");
if (!["localhost", "127.0.0.1"].includes(endpoint.hostname) || endpoint.pathname !== "/oauth_ci") {
  throw new Error("Operator setup tests require disposable loopback PostgreSQL.");
}
const host = "aws-1-us-east-2.pooler.supabase.com";
const ref = "abcdefghijklmnopqrst";
const approved = `postgres://chatgpt_oauth_runtime.${ref}:disposable-only@${host}:5432/postgres`;
assert.equal(new URL(hostedOperatorDatabaseUrl(approved + "?sslmode=disable", host, ref)).search, "?sslmode=verify-full");
for (const raw of [approved.replace("chatgpt_oauth_runtime.", "postgres."),
  approved.replace(host, "wrong.example.test"), approved.replace(":5432", ":6543"),
  approved.replace("/postgres", "/other"), approved.replace(ref, "wrongprojectreference")]) {
  assert.throws(() => hostedOperatorDatabaseUrl(raw, host, ref));
}

const client = new Client({ connectionString: endpoint.toString() });
await client.connect();
const input = { email: "operator@example.test", password: "Disposable OAuth password 2026" };
try {
  await client.query("begin");
  await assert.rejects(prepareOperatorLogin(client, input), /restricted OAuth role/);
  await client.query("set local role chatgpt_oauth_runtime");
  const initial = await client.query('select count(*)::int as n from "chatgpt_oauth"."user"');
  assert.equal(initial.rows[0].n, 0);
  await assert.rejects(prepareOperatorLogin(client, { ...input,
    resetSubject: "00000000-0000-4000-8000-000000000000" }), /was not found/);
  for (const bad of [{ ...input, email: "BAD@example.test" }, { ...input, password: "short" }]) {
    await assert.rejects(prepareOperatorLogin(client, bad), /lowercase email/);
  }
  const result = await prepareOperatorLogin(client, input);
  assert.equal(result.created, true);
  const rows = await client.query('select "password", "providerId", "accountId", "userId" from "chatgpt_oauth"."account"');
  assert.equal(rows.rowCount, 1);
  assert.equal(rows.rows[0].providerId, "credential");
  assert.equal(rows.rows[0].accountId, result.id);
  assert.equal(rows.rows[0].userId, result.id);
  assert.notEqual(rows.rows[0].password, input.password);
  assert.equal(await verifyPassword({ hash: rows.rows[0].password, password: input.password }), true);
  assert.deepEqual(await prepareOperatorLogin(client, input), { id: result.id, created: false });
  await assert.rejects(prepareOperatorLogin(client, { ...input, password: "A different valid password" }), /does not match/);
  await assert.rejects(prepareOperatorLogin(client, { ...input, email: "other@example.test" }), /needs review/);
  const unchanged = await client.query('select "password" from "chatgpt_oauth"."account"');
  assert.equal(unchanged.rows[0].password, rows.rows[0].password);
  const resetPassword = "Replacement disposable OAuth password 2026";
  await assert.rejects(prepareOperatorLogin(client, { ...input, password: resetPassword,
    resetSubject: "00000000-0000-4000-8000-000000000000" }), /does not match the approved reset subject/);
  await client.query(`insert into "chatgpt_oauth"."session"
    ("id", "token", "userId", "expiresAt", "updatedAt")
    values ('reset-test-session', 'disposable-reset-session', $1, now()+interval '1 hour', now())`, [result.id]);
  await client.query(`insert into "chatgpt_oauth"."oauthClient"
    ("id", "clientId", "redirectUris") values ('reset-test-client', 'reset-test-client', '[]'::jsonb)`);
  await client.query(`insert into "chatgpt_oauth"."oauthRefreshToken"
    ("id", "token", "clientId", "sessionId", "userId", "expiresAt", "createdAt", "scopes")
    values ('reset-test-refresh', 'reset-test-refresh', 'reset-test-client', 'reset-test-session', $1,
      now()+interval '1 hour', now(), '["openid"]'::jsonb)`, [result.id]);
  await client.query(`insert into "chatgpt_oauth"."oauthAccessToken"
    ("id", "token", "clientId", "sessionId", "userId", "refreshId", "expiresAt", "createdAt", "scopes")
    values ('reset-test-access', 'reset-test-access', 'reset-test-client', 'reset-test-session', $1,
      'reset-test-refresh', now()+interval '5 minutes', now(), '["openid"]'::jsonb)`, [result.id]);
  assert.deepEqual(await prepareOperatorLogin(client, { ...input, password: resetPassword, resetSubject: result.id }),
    { id: result.id, created: false, reset: true });
  const resetAccount = await client.query('select "password" from "chatgpt_oauth"."account"');
  assert.equal(await verifyPassword({ hash: resetAccount.rows[0].password, password: resetPassword }), true);
  assert.equal(await verifyPassword({ hash: resetAccount.rows[0].password, password: input.password }), false);
  const sessions = await client.query('select count(*)::int as n from "chatgpt_oauth"."session" where "userId"=$1', [result.id]);
  assert.equal(sessions.rows[0].n, 0);
  for (const table of ['oauthAccessToken', 'oauthRefreshToken']) {
    const tokens = await client.query(`select count(*)::int as n from "chatgpt_oauth"."${table}" where "userId"=$1`, [result.id]);
    assert.equal(tokens.rows[0].n, 0);
  }
  assert.deepEqual(await prepareOperatorLogin(client, { ...input, password: resetPassword }), { id: result.id, created: false });
  // Simulate an unexpected second identity; the helper must never reset or add another.
  await client.query(`insert into "chatgpt_oauth"."user" ("id", "name", "email", "emailVerified")
    values ('unexpected-test-user', 'Disposable', 'unexpected@example.test', false)`);
  await assert.rejects(prepareOperatorLogin(client, input), /needs review/);
  await client.query("rollback");
  console.log("PASS: restricted OAuth setup hashes credentials, rejects implicit resets, targets explicit resets by subject and revokes sessions.");
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}
