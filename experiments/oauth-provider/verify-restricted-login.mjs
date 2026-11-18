import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Pool } from "pg";

// Runs solely against disposable GitHub Actions PostgreSQL.
// Never run against the shared Graymills Supabase project.
const url = process.env.OAUTH_TEST_DATABASE_URL;
if (!url) throw new Error("Missing disposable PostgreSQL URL");
const endpoint = new URL(url);
if (!["localhost", "127.0.0.1"].includes(endpoint.hostname) ||
    endpoint.pathname !== "/oauth_ci") {
  throw new Error("Restricted-login test refuses non-disposable databases");
}
const pool = new Pool({ connectionString: url });
try {
  await pool.query(readFileSync(new URL("./restricted-login.sql", import.meta.url), "utf8"));
  const status = await pool.query(
    "select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolinherit, rolconnlimit from pg_roles where rolname=$1",
    ["chatgpt_oauth_runtime"],
  );
  assert.equal(status.rowCount, 1);
  assert.deepEqual(
    status.rows[0],
    { rolcanlogin: true, rolsuper: false, rolcreatedb: false,
      rolcreaterole: false, rolbypassrls: false, rolinherit: false,
      rolconnlimit: 3 },
  );
  const credential = await pool.query(
    "select rolpassword is null as disabled from pg_authid where rolname=$1",
    ["chatgpt_oauth_runtime"],
  );
  assert.equal(credential.rows[0].disabled, true);

  await pool.query("create table public.taskboard_canary (id integer)");
  await pool.query("create schema auth");
  await pool.query("create table auth.supabase_auth_canary (id integer)");

  const connection = await pool.connect();
  try {
    await connection.query("begin");
    await connection.query("set local role chatgpt_oauth_runtime");
    await connection.query('select count(*) from "chatgpt_oauth"."user"');
    await connection.query(
      'insert into "chatgpt_oauth"."verification" ("id", "identifier", "value", "expiresAt") values ($1,$2,$3,now() + interval \'1 hour\')',
      ["ci-only-id", "ci-only-identifier", "ci-only-value"],
    );
    await connection.query(
      'delete from "chatgpt_oauth"."verification" where "id"=$1',
      ["ci-only-id"],
    );
    for (const statement of [
      "select count(*) from public.taskboard_canary",
      "select count(*) from auth.supabase_auth_canary",
    ]) {
      await connection.query("savepoint denied_operation");
      await assert.rejects(
        connection.query(statement),
        (error) => error?.code === "42501",
        `Expected permission-denied (42501): ${statement}`,
      );
      await connection.query("rollback to savepoint denied_operation");
    }
    await connection.query("rollback");
  } finally {
    connection.release();
  }
  console.log("PASS: login disabled, private OAuth DML allowed, public/Auth table access denied.");
} finally {
  await pool.end();
}
