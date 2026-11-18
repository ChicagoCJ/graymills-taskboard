import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const generated = readFileSync(resolve("generated-schema.sql"), "utf8");
const reviewed = readFileSync(resolve("reviewed-schema.sql"), "utf8");

const ddl = (sql) => sql.split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => /^create (schema|table|(?:unique )?index) /i.test(line));

const generatedDdl = ddl(generated);
const reviewedDdl = ddl(reviewed);

assert.equal(generatedDdl.length, 31, "Unexpected generated SQL statement count");
assert.deepEqual(
  generatedDdl,
  reviewedDdl,
  "Auth dependency changed the reviewed migration SQL; review before deployment",
);
assert.equal(
  generatedDdl.filter((line) => line.startsWith('create table "chatgpt_oauth".')).length,
  12,
  "Expected 12 private authentication tables",
);
assert.equal(
  generatedDdl.filter((line) => /^create (?:unique )?index /i.test(line)).length,
  18,
  "Expected 18 application indexes",
);
assert.ok(
  generatedDdl.every((line) => line.includes('"chatgpt_oauth"')),
  "All generated objects must belong to private chatgpt_oauth schema",
);
assert.equal(
  (reviewed.match(/alter table "chatgpt_oauth"\."[^"]+" enable row level security;/g) || []).length,
  12,
  "Every private authentication table must enable RLS",
);
assert.ok(
  reviewed.includes("revoke all on schema \"chatgpt_oauth\" from PUBLIC, anon, authenticated, authenticator, service_role;"),
  "Private schema must revoke all API and client roles",
);
assert.ok(
  !/\b(drop|truncate|delete from|update public|alter table public)\b/i.test(reviewed),
  "Unexpected destructive statement in reviewed SQL",
);
console.log("PASS: 31 generated OAuth DDL statements match reviewed private-schema migration.");
