-- READ-ONLY PREFLIGHT for the proposed ChatGPT/TaskBoard integration rollout.
-- Safe for a live Supabase query editor; performs SELECTs only.
-- Any FAIL is a stop condition. Re-run immediately before an approved migration.
WITH expected(table_name) AS (
  VALUES ('activity_log'),('custom_fields'),('notification_dismissals'),
    ('notification_preferences'),('profiles'),('project_teams'),
    ('projects'),('tags'),('task_assignees'),('task_attachments'),
    ('task_comments'),('task_custom_field_values'),('task_subtasks'),
    ('task_tags'),('tasks'),('team_members'),('teams'),('user_integrations')
), actual AS (
  SELECT c.relname AS table_name,c.relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
), checks AS (
  SELECT 'public table inventory' AS check_name,
    NOT EXISTS (
      SELECT table_name FROM actual EXCEPT SELECT table_name FROM expected
    ) AND NOT EXISTS (
      SELECT table_name FROM expected EXCEPT SELECT table_name FROM actual
    ) AS passed,
    (SELECT count(*)::text FROM actual) || ' tables found; expected 18' AS detail
  UNION ALL
  SELECT 'all public tables have RLS',
    NOT EXISTS (SELECT 1 FROM actual WHERE NOT relrowsecurity),
    (SELECT count(*)::text FROM actual WHERE NOT relrowsecurity) || ' without RLS'
  UNION ALL
  SELECT 'no existing isolation policy names',
    NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE (schemaname='public' OR (schemaname='storage' AND tablename='objects'))
        AND policyname LIKE 'chatgpt_iso_%'
    ),
    (SELECT count(*)::text FROM pg_policies
      WHERE (schemaname='public' OR (schemaname='storage' AND tablename='objects'))
        AND policyname LIKE 'chatgpt_iso_%') || ' matching policies'
  UNION ALL
  SELECT 'SEO project exists and is active',
    (SELECT count(*)=1 FROM public.projects
      WHERE id='22eacfd8-22f8-4c01-a51d-44987facad42'::uuid
        AND is_active=true),
    'Expected exactly one approved active SEO project'
  UNION ALL
  SELECT 'private task-attachments bucket',
    (SELECT count(*)=1 FROM storage.buckets
      WHERE id='task-attachments' AND public=false),
    'Expected exactly one private task-attachments bucket'
  UNION ALL
  SELECT 'storage.objects has RLS',
    EXISTS (
      SELECT 1 FROM pg_class
      WHERE oid=to_regclass('storage.objects') AND relrowsecurity
    ),
    'RLS must already be enabled on storage.objects'
  UNION ALL
  SELECT 'new-user trigger remains enabled',
    EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgname='on_auth_user_created'
        AND t.tgrelid='auth.users'::regclass
        AND t.tgfoid='public.handle_new_user()'::regprocedure
        AND t.tgenabled IN ('O','A')
    ),
    'Creating Auth user currently creates active public.profiles Member'
  UNION ALL
  SELECT 'no obvious preexisting ChatGPT Auth identity',
    NOT EXISTS (
      SELECT 1 FROM auth.users
      WHERE email ILIKE '%chatgpt%' OR email ILIKE '%integration%'
    ),
    'Name-based scan only; confirm exact approved identity separately'
)
SELECT check_name,
  CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result,
  detail
FROM checks ORDER BY check_name;
