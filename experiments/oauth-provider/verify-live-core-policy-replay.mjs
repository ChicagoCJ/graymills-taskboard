import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

// Replays actual live policy definitions but never connects to live Supabase.
// Every table, identity and record in this test is disposable synthetic data.
const sourceUrl = process.env.OAUTH_TEST_DATABASE_URL;
if (!sourceUrl) throw new Error("Missing disposable PostgreSQL URL.");
const u = new URL(sourceUrl);
if (!["127.0.0.1","localhost"].includes(u.hostname) || u.pathname !== "/oauth_ci") {
  throw new Error("Refusing to run policy replay outside localhost oauth_ci.");
}
const bootstrap = new Pool({ connectionString: sourceUrl });
const dbName = "oauth_policy_replay";
await bootstrap.query(`CREATE DATABASE ${dbName}`);
await bootstrap.end();
const replayUrl = new URL(sourceUrl);
replayUrl.pathname = "/" + dbName;
const pool = new Pool({connectionString: replayUrl.toString()});
const integrationId = "f0000000-0000-4000-8000-000000000001";
const employeeId = "e0000000-0000-4000-8000-000000000002";
const adminId = "a0000000-0000-4000-8000-000000000003";
const seoId = "22eacfd8-22f8-4c01-a51d-44987facad42";
const otherId = "d0000000-0000-4000-8000-000000000003";
const seoTask = "c0000000-0000-4000-8000-000000000004";
const otherTask = "c0000000-0000-4000-8000-000000000005";
const expectedTables = [
  "activity_log","custom_fields","notification_dismissals",
  "notification_preferences","profiles","project_teams","projects",
  "tags","task_assignees","task_attachments","task_comments",
  "task_custom_field_values","task_subtasks","task_tags","tasks",
  "team_members","teams","user_integrations",
];
const queryCount = async (client, sql) => (await client.query(sql)).rows.length;
async function asUser(userId, metadata, cb) {
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE authenticated");
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)",[userId]);
    await client.query("SELECT set_config('request.jwt.claims', $1, true)",[JSON.stringify({
      sub:userId, role:"authenticated",app_metadata: metadata.app_metadata || {},
      user_metadata: metadata.user_metadata || {},
    })]);
    await cb(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}
try {
  await pool.query(`
    CREATE SCHEMA auth;
    CREATE SCHEMA storage;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $body$
      SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid
    $body$;
    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $body$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb
    $body$;
    CREATE OR REPLACE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $body$
      SELECT string_to_array($1,'/')
    $body$;
    GRANT USAGE ON SCHEMA auth,storage TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid(),auth.jwt(),storage.foldername(text) TO authenticated;

    CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL DEFAULT 'member', is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE public.projects (id uuid PRIMARY KEY, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE public.tasks (id uuid PRIMARY KEY, project_id uuid NOT NULL,
      created_by_profile_id uuid, title text DEFAULT 'fixture', is_archived boolean NOT NULL DEFAULT false);
    CREATE TABLE public.task_assignees (id uuid PRIMARY KEY,task_id uuid,profile_id uuid,team_id uuid);
    CREATE TABLE public.team_members (id uuid PRIMARY KEY,team_id uuid,profile_id uuid);
    CREATE TABLE public.task_attachments (id uuid PRIMARY KEY,task_id uuid,file_path text,uploaded_by_profile_id uuid);
    CREATE TABLE storage.objects (id uuid PRIMARY KEY,bucket_id text,name text);
  `);
  for (const table of expectedTables) {
    if (!["profiles","projects","tasks","task_assignees","team_members","task_attachments"].includes(table)) {
      await pool.query(`CREATE TABLE public.${table}(id uuid PRIMARY KEY)`);
    }
    await pool.query(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON public.${table} TO authenticated`);
  }
  await pool.query(`
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
  `);

  // No live user or task data is extracted. The fixture has two synthetic
  // projects, two assigned tasks and one private attachment.
  await pool.query("INSERT INTO profiles(id,role) VALUES ($1,'member'),($2,'member'),($3,'admin')",[integrationId,employeeId,adminId]);
  await pool.query("INSERT INTO projects(id) VALUES ($1),($2)",[seoId,otherId]);
  await pool.query("INSERT INTO tasks(id,project_id,created_by_profile_id) VALUES ($1,$2,$3),($4,$5,$3)",
    [seoTask,seoId,integrationId,otherTask,otherId]);
  await pool.query("INSERT INTO task_assignees(id,task_id,profile_id) VALUES ($1,$2,$3),($4,$5,$3),($6,$2,$7),($8,$5,$7)",
    ["11111111-1111-4111-8111-111111111111",seoTask,integrationId,
     "22222222-2222-4222-8222-222222222222",otherTask,
     "33333333-3333-4333-8333-333333333333",employeeId,
     "44444444-4444-4444-8444-444444444444"]);
  await pool.query("INSERT INTO task_attachments(id,task_id,file_path,uploaded_by_profile_id) VALUES ($1,$2,$3,$4)",
    ["55555555-5555-4555-8555-555555555555",seoTask,`${integrationId}/fixture.txt`,integrationId]);
  await pool.query("INSERT INTO storage.objects(id,bucket_id,name) VALUES ($1,'task-attachments',$2)",
    ["66666666-6666-4666-8666-666666666666",`${integrationId}/fixture.txt`]);

  // Actual policy/function SQL obtained with read-only pg_policies and
  // pg_get_functiondef queries on live TaskBoard. Replay original clauses.
  const live = await readFile(new URL("./live-core-policies.snapshot.sql",import.meta.url),"utf8");
  const expressions = [...live.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\([\s\S]*?AS \$function\$[\s\S]*?\$function\$\s*;/g)];
  assert.equal(expressions.length,6,"Snapshot must contain all six access helpers.");
  const byName=new Map(expressions.map(x=>[x[1],x[0]]));
  for (const name of ["is_active_user","is_admin","is_manager","is_admin_or_manager","can_see_task","is_task_assignee"]) {
    await pool.query(byName.get(name));
  }
  const policySql = live.slice(expressions.at(-1).index+expressions.at(-1)[0].length);
  await pool.query(policySql);
  const originalCount=await pool.query(`SELECT count(*)::int AS n FROM pg_policies
    WHERE (schemaname='public' AND tablename IN ('profiles','projects','tasks','task_assignees'))
    OR (schemaname='storage' AND tablename='objects')`);
  assert.equal(originalCount.rows[0].n,21);

  // Confirm the actual pre-change policies allow the integration Member
  // to see unrelated active projects and edit its assigned task.
  await asUser(integrationId, {}, async c=>{
    assert.equal(await queryCount(c,"SELECT id FROM projects"),2,
      "Baseline live policy exposes both active projects to a Member.");
    assert.equal(await queryCount(c,"SELECT id FROM tasks"),2,
      "Assigned Member can see tasks across two projects before restrictions.");
    assert.equal((await c.query("UPDATE tasks SET title='pre-change-edit' WHERE id=$1",[otherTask])).rowCount,1,
      "Baseline allows assigned-task UPDATE; test must detect this exposure.");
  });

  const restrictionSql=await readFile(new URL("./integration-rls-isolation.review.sql",import.meta.url),"utf8");
  const storageSql=await readFile(new URL("./integration-storage-isolation.review.sql",import.meta.url),"utf8");
  await pool.query(restrictionSql);
  await pool.query(storageSql);

  const marked={app_metadata:{taskboard_integration:"graymills_seo_readonly_v1"}};
  await asUser(integrationId,marked,async c=>{
    const projects=(await c.query("SELECT id FROM projects")).rows.map(r=>r.id);
    const tasks=(await c.query("SELECT id FROM tasks")).rows.map(r=>r.id);
    assert.deepEqual(projects,[seoId],"Marked integration sees only approved SEO project.");
    assert.deepEqual(tasks,[seoTask],"Marked integration sees only SEO task.");
    assert.equal(await queryCount(c,"SELECT id FROM profiles"),1);
    assert.equal(await queryCount(c,"SELECT id FROM storage.objects"),0);
    assert.equal((await c.query("UPDATE tasks SET title='should-not-work' WHERE id=$1",[seoTask])).rowCount,0);
    assert.equal((await c.query("DELETE FROM tasks WHERE id=$1",[seoTask])).rowCount,0);
    assert.equal((await c.query("UPDATE profiles SET role='admin' WHERE id=$1",[integrationId])).rowCount,0);
    await c.query("SAVEPOINT denied_insert");
    await assert.rejects(c.query("INSERT INTO tasks(id,project_id) VALUES ($1,$2)",
      ["77777777-7777-4777-8777-777777777777",seoId]),{code:"42501"});
    await c.query("ROLLBACK TO SAVEPOINT denied_insert");
    await c.query("SAVEPOINT denied_upload");
    await assert.rejects(c.query("INSERT INTO storage.objects(id,bucket_id,name) VALUES ($1,'task-attachments',$2)",
      ["88888888-8888-4888-8888-888888888888",`${integrationId}/other.txt`]),{code:"42501"});
    await c.query("ROLLBACK TO SAVEPOINT denied_upload");
  });

  // Prove user-editable user_metadata cannot assign the trusted restriction marker.
  await asUser(employeeId,{user_metadata:{taskboard_integration:"graymills_seo_readonly_v1"}},async c=>{
    assert.equal(await queryCount(c,"SELECT id FROM projects"),2,
      "Unmarked ordinary Member retains original active project visibility.");
    assert.equal(await queryCount(c,"SELECT id FROM tasks"),2,
      "Ordinary Member assignment visibility is unchanged.");
    assert.equal((await c.query("UPDATE tasks SET title='employee-edit' WHERE id=$1",[otherTask])).rowCount,1,
      "Ordinary employee retains assigned task UPDATE.");
  });
  await asUser(adminId,{},async c=>{
    assert.equal(await queryCount(c,"SELECT id FROM projects"),2);
    assert.equal(await queryCount(c,"SELECT id FROM tasks"),2);
  });
  console.log("PASS: exact 21 live core policy clauses plus six access functions replayed on disposable DB; integration scoped read-only and employee behavior preserved.");
  console.log("LIMITATION: synthetic table definitions, no live Auth, PostgREST or Supabase Storage API tested.");
} finally {
  await pool.end();
}
