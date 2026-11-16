import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

// Only bootstrap the local Supabase CLI database. Never use a remote URL.
const url=process.env.DB_URL || "";
const parsed=new URL(url);
if (!["127.0.0.1","localhost"].includes(parsed.hostname) ||
    parsed.port!=="54322" || parsed.pathname!=="/postgres" ||
    parsed.username!=="postgres") {
  throw new Error("Refusing to prepare anything other than disposable Supabase CLI localhost database.");
}
const pool=new Pool({connectionString:url});
const names=[
  "activity_log","custom_fields","notification_dismissals",
  "notification_preferences","profiles","project_teams","projects",
  "tags","task_assignees","task_attachments","task_comments",
  "task_custom_field_values","task_subtasks","task_tags","tasks",
  "team_members","teams","user_integrations",
];
const extra={
 profiles:", email text, full_name text, role text NOT NULL DEFAULT 'member', profile_color text, is_active boolean NOT NULL DEFAULT true, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()",
 projects:", name text DEFAULT 'fixture', is_active boolean NOT NULL DEFAULT true",
 tasks:", project_id uuid NOT NULL, created_by_profile_id uuid, title text DEFAULT 'fixture', is_archived boolean NOT NULL DEFAULT false",
 task_assignees:", task_id uuid, profile_id uuid, team_id uuid",
 task_attachments:", task_id uuid, file_path text, uploaded_by_profile_id uuid",
 team_members:", team_id uuid, profile_id uuid",
};
try{
  const preflight=await pool.query("SELECT to_regclass('auth.users') AS users,to_regclass('storage.objects') AS objects");
  assert.ok(preflight.rows[0].users && preflight.rows[0].objects,
    "Full local Supabase Auth and Storage must be installed before fixture.");
  for(const name of names){
    await pool.query(`CREATE TABLE public.${name} (id uuid PRIMARY KEY ${extra[name]||""})`);
    await pool.query(`ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON public.${name} TO authenticated`);
    // Supplementary non-core tables remain permissive for a deliberately
    // adversarial integration-identity isolation test.
    if(!["profiles","projects","tasks","task_assignees"].includes(name)){
      await pool.query(`CREATE POLICY fixture_existing_permissive ON public.${name}
        AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true)`);
    }
  }
  await pool.query("GRANT USAGE ON SCHEMA public TO authenticated,anon");
  const live=await readFile(new URL("./live-core-policies.snapshot.sql",import.meta.url),"utf8");
  const defs=[...live.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\([\s\S]*?AS \$function\$[\s\S]*?\$function\$\s*;/g)];
  assert.equal(defs.length,6,"Expected six original authorization helpers.");
  const byName=new Map(defs.map(x=>[x[1],x[0]]));
  for(const name of ["is_active_user","is_admin","is_manager",
    "is_admin_or_manager","can_see_task","is_task_assignee"]){
    await pool.query(byName.get(name));
  }
  // Local Storage's own system policies may exist. Apply the exact
  // TaskBoard attachment policies only when the names aren't present.
  const original=live.slice(defs.at(-1).index+defs.at(-1)[0].length);
  await pool.query(original);

  // Clone the *observed* auth.users -> profiles trigger behavior. This
  // function is installed only in the local disposable database.
  await pool.query(`
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public' AS $func$
    BEGIN
      INSERT INTO public.profiles
        (id,email,full_name,role,profile_color,is_active)
      VALUES (
        NEW.id,NEW.email,
        COALESCE(NEW.raw_user_meta_data ->> 'full_name',
          split_part(NEW.email,'@',1),'New User'),
        'member','#2563EB',true)
      ON CONFLICT(id) DO UPDATE SET
        email=excluded.email,
        full_name=coalesce(public.profiles.full_name, excluded.full_name),
        is_active=coalesce(public.profiles.is_active,true);
      RETURN NEW;
    END;
    $func$;
    CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  `);
  await pool.query("INSERT INTO public.projects(id,name) VALUES ($1,$2),($3,$4)",
    ["22eacfd8-22f8-4c01-a51d-44987facad42","Parts Washers SEO",
     "d0000000-0000-4000-8000-000000000003","Unrelated project"]);
  await pool.query(`INSERT INTO public.tasks(id,project_id,title) VALUES
    ('c0000000-0000-4000-8000-000000000004','22eacfd8-22f8-4c01-a51d-44987facad42','SEO fixture'),
    ('c0000000-0000-4000-8000-000000000005','d0000000-0000-4000-8000-000000000003','Other fixture')`);
  // Private bucket: metadata and files stored only in disposable Supabase.
  await pool.query(`INSERT INTO storage.buckets(id,name,public)
    VALUES ('task-attachments','task-attachments',false)
    ON CONFLICT (id) DO NOTHING`);
  await pool.query(await readFile(new URL("./integration-rls-isolation.review.sql",import.meta.url),"utf8"));
  await pool.query(await readFile(new URL("./integration-storage-isolation.review.sql",import.meta.url),"utf8"));
  await pool.query("NOTIFY pgrst, 'reload schema'");
  console.log("PASS: local Supabase Auth trigger, 18 public tables, actual core policies, restrictive isolation and private Storage bucket installed.");
}finally{await pool.end();}
