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
  // Simulate an unexpected second identity; the helper must never reset or add another.
  await client.query(`insert into "chatgpt_oauth"."user" ("id", "name", "email", "emailVerified")
    values ('unexpected-test-user', 'Disposable', 'unexpected@example.test', false)`);
  await assert.rejects(prepareOperatorLogin(client, input), /needs review/);
  await client.query("rollback");
  console.log("PASS: restricted OAuth setup creates a hashed login, verifies repeats, rejects resets and rolls back disposable fixtures.");
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}
