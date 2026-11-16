import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const connectionString = process.env.OAUTH_TEST_DATABASE_URL;
if (!connectionString || !new URL(connectionString).hostname.match(/^(127\.0\.0\.1|localhost)$/)) {
  throw new Error("RLS proof tests require only disposable loopback PostgreSQL.");
}
if (new URL(connectionString).pathname !== "/oauth_ci") {
  throw new Error("Refusing RLS fixture outside the disposable oauth_ci database.");
}
const pool = new Pool({ connectionString });
const integrationId = "f0000000-0000-4000-8000-000000000001";
const employeeId = "e0000000-0000-4000-8000-000000000002";
const seoId = "22eacfd8-22f8-4c01-a51d-44987facad42";
const otherProjectId = "d0000000-0000-4000-8000-000000000003";
const visibleTaskId = "c0000000-0000-4000-8000-000000000004";
const otherTaskId = "c0000000-0000-4000-8000-000000000005";
const archivedTaskId = "c0000000-0000-4000-8000-000000000006";
const tables = [
  "activity_log", "custom_fields", "notification_dismissals",
  "notification_preferences", "profiles", "project_teams", "projects",
  "tags", "task_assignees", "task_attachments", "task_comments",
  "task_custom_field_values", "task_subtasks", "task_tags", "tasks",
  "team_members", "teams", "user_integrations",
];

try {
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
    END $$;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
      LANGUAGE sql STABLE AS $
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
      $;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated;
  `);

  // Earlier disposable login tests intentionally leave a public canary.
  // Remove it only within this ephemeral test database.
  await pool.query("DROP TABLE IF EXISTS public.taskboard_canary");

  // This is a disposable synthetic *policy fixture*, not the user's real data.
  // Each table intentionally starts with a permissive policy so the new
  // RESTRICTIVE policies must actively stop otherwise-allowed reads/writes.
  for (const table of tables) {
    const extra = table === "profiles"
      ? ", role text NOT NULL DEFAULT 'member', is_active boolean NOT NULL DEFAULT true"
      : table === "projects"
        ? ", is_active boolean NOT NULL DEFAULT true"
        : table === "tasks"
          ? ", project_id uuid NOT NULL, is_archived boolean NOT NULL DEFAULT false, title text NOT NULL DEFAULT 'fixture'"
          : "";
    await pool.query(`CREATE TABLE public.${table} (id uuid PRIMARY KEY${extra})`);
    await pool.query(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${table} TO authenticated`);
    await pool.query(`CREATE POLICY existing_permissive ON public.${table}
      AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true)`);
  }
  await pool.query(`INSERT INTO public.profiles(id) VALUES ($1),($2)`,
    [integrationId, employeeId]);
  await pool.query(`INSERT INTO public.projects(id) VALUES ($1),($2)`,
    [seoId, otherProjectId]);
  await pool.query(`INSERT INTO public.tasks(id,project_id) VALUES ($1,$2),($3,$4),($5,$6)`,
    [visibleTaskId,seoId,otherTaskId,otherProjectId,archivedTaskId,seoId]);
  await pool.query(`UPDATE public.tasks SET is_archived=true WHERE id=$1`,[archivedTaskId]);
  await pool.query(`INSERT INTO public.task_comments(id) VALUES ($1)`,
    ["b0000000-0000-4000-8000-000000000007"]);

  // Synthetic private Supabase Storage fixture: existing authenticated
  // users can see and mutate their own objects before the new restrictions.
  await pool.query("CREATE SCHEMA storage");
  await pool.query("CREATE TABLE storage.objects (id uuid PRIMARY KEY, bucket_id text NOT NULL, name text NOT NULL)");
  await pool.query("ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY");
  await pool.query("GRANT USAGE ON SCHEMA storage TO authenticated");
  await pool.query("GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated");
  await pool.query(`CREATE POLICY existing_attachment_policy ON storage.objects
    AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true)`);
  const storageObjectId = "90000000-0000-4000-8000-000000000009";
  await pool.query("INSERT INTO storage.objects (id,bucket_id,name) VALUES ($1,$2,$3)",
    [storageObjectId,"task-attachments",`${integrationId}/example.txt`]);

  const sql = await readFile(new URL("./integration-rls-isolation.review.sql", import.meta.url),"utf8");
  await pool.query(sql);
  const storageSql = await readFile(new URL("./integration-storage-isolation.review.sql", import.meta.url),"utf8");
  await pool.query(storageSql);
  const storagePolicies = await pool.query(`SELECT policyname, permissive, cmd FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'chatgpt_iso_%'`);
  assert.equal(storagePolicies.rowCount,4,"Storage objects must have four restrictive policies.");
  assert.ok(storagePolicies.rows.every((p) => p.permissive === "RESTRICTIVE"));
  const policies = await pool.query(`SELECT tablename, cmd, permissive, policyname FROM pg_policies
    WHERE schemaname='public' AND policyname LIKE 'chatgpt_iso_%'`);
  assert.equal(policies.rowCount, tables.length*4, "Four restrictive policies per public table required.");
  assert.ok(policies.rows.every((p) => p.permissive === "RESTRICTIVE"));

  async function asUser(userId, work, isIntegration = false) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE authenticated");
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[userId]);
      const claims = { sub: userId, app_metadata: isIntegration
        ? { taskboard_integration: 'graymills_seo_readonly_v1' } : {} };
      await client.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
      await work(client);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  }

  await asUser(integrationId, async (client) => {
    const projects = await client.query("SELECT id FROM public.projects");
    assert.deepEqual(projects.rows.map((r) => r.id),[seoId], "Integration sees only SEO project.");
    const tasks = await client.query("SELECT id FROM public.tasks");
    assert.deepEqual(tasks.rows.map((r) => r.id),[visibleTaskId],
      "Integration sees only non-archived SEO tasks.");
    const profiles = await client.query("SELECT id FROM public.profiles");
    assert.deepEqual(profiles.rows.map((r) => r.id),[integrationId],
      "Integration sees only its own active Member profile.");

    for (const table of tables.filter((t) => !["profiles","projects","tasks"].includes(t))) {
      const rows = await client.query(`SELECT id FROM public.${table}`);
      assert.equal(rows.rowCount,0,`Integration must have no SELECT visibility on ${table}`);
    }
    const storageRows = await client.query("SELECT id FROM storage.objects");
    assert.equal(storageRows.rowCount,0,"Integration must not read its own storage objects.");
    const storageUpdate = await client.query("UPDATE storage.objects SET name='changed' WHERE id=$1",
      [storageObjectId]);
    assert.equal(storageUpdate.rowCount,0,"Integration must not update attachments.");
    const storageDelete = await client.query("DELETE FROM storage.objects WHERE id=$1",[storageObjectId]);
    assert.equal(storageDelete.rowCount,0,"Integration must not delete attachments.");
    const update = await client.query("UPDATE public.tasks SET title='must-not-change' WHERE id=$1",[visibleTaskId]);
    assert.equal(update.rowCount,0,"Integration must be unable to UPDATE an otherwise-visible task.");
    const remove = await client.query("DELETE FROM public.tasks WHERE id=$1",[visibleTaskId]);
    assert.equal(remove.rowCount,0,"Integration must be unable to DELETE an otherwise-visible task.");
    const profileChange = await client.query("UPDATE public.profiles SET role='admin' WHERE id=$1",[integrationId]);
    assert.equal(profileChange.rowCount,0,"Integration cannot elevate its profile role.");
    await client.query("SAVEPOINT blocked_storage_insert");
    const storageInsert = await client.query(
      "INSERT INTO storage.objects(id,bucket_id,name) VALUES ($1,$2,$3)",
      ["80000000-0000-4000-8000-000000000008","task-attachments",`${integrationId}/new.txt`]
    ).then(() => false, (error) => error.code === "42501");
    assert.equal(storageInsert,true,"Integration must not upload attachments.");
    await client.query("ROLLBACK TO SAVEPOINT blocked_storage_insert");
    const insert = await client.query("INSERT INTO public.tasks(id,project_id) VALUES ($1,$2)",
      ["a0000000-0000-4000-8000-000000000008",seoId]).then(() => false,
      (error) => error.code === "42501");
    assert.equal(insert,true,"Integration must be unable to INSERT tasks.");
    // An error leaves a PostgreSQL transaction aborted; test employee next.
  }, true);

  await asUser(employeeId, async (client) => {
    assert.equal((await client.query("SELECT id FROM public.projects")).rowCount,2,
      "Employee's existing project visibility must be retained.");
    assert.equal((await client.query("SELECT id FROM public.tasks")).rowCount,3,
      "Employee's existing tasks visibility must be retained.");
    assert.equal((await client.query("SELECT id FROM storage.objects")).rowCount,1,
      "Employee's existing Storage SELECT access must be retained.");
    const employeeStorageEdit = await client.query("UPDATE storage.objects SET name='employee-edit' WHERE id=$1",
      [storageObjectId]);
    assert.equal(employeeStorageEdit.rowCount,1,"Employee's existing Storage UPDATE access must be retained.");
    const update = await client.query("UPDATE public.tasks SET title='employee-can-edit' WHERE id=$1",
      [visibleTaskId]);
    assert.equal(update.rowCount,1,"Employee's existing UPDATE permission must be retained.");
  });
  console.log("PASS: 18 tables have 72 restrictive policies plus four Storage policies; integration cannot mutate or read attachments and employee permissions retained.");

  // A new public table must trigger a design review, not silently get access.
  await pool.query("CREATE TABLE public.new_unreviewed_table (id uuid)");
  await assert.rejects(pool.query(sql), /inventory drift/);
  console.log("PASS: installation fails closed when public table inventory changes.");
} finally {
  await pool.end();
}
