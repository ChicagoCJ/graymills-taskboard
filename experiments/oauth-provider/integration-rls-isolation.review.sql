-- REVIEW-ONLY: DO NOT RUN ON LIVE SUPABASE.
-- TaskBoard 3.18J restricted integration isolation proof-of-concept.
-- The integration identity is selected using *admin-controlled* app_metadata.
-- Do not use user_metadata: users can edit it. Do not grant integration flag to employees.
-- REVIEW ONLY: this has not been deployed or verified against live Auth JWTs.
-- The SEO project UUID is the verified existing Parts Washers SEO project.
-- The explicit public-table inventory fails if the schema drifts.
DO $policy$
DECLARE
  seo_project_id uuid := '22eacfd8-22f8-4c01-a51d-44987facad42';
  tables text[] := ARRAY[
    'activity_log','custom_fields','notification_dismissals',
    'notification_preferences','profiles','project_teams','projects',
    'tags','task_assignees','task_attachments','task_comments',
    'task_custom_field_values','task_subtasks','task_tags','tasks',
    'team_members','teams','user_integrations'
  ];
  inventory text[];
  t text;
  guard text := '(COALESCE((auth.jwt() -> ''app_metadata'' ->> ''taskboard_integration''), '''') <> ''graymills_seo_readonly_v1'')';
  read_guard text;
BEGIN
  SELECT array_agg(c.relname ORDER BY c.relname) INTO inventory
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p');
  IF inventory IS DISTINCT FROM tables THEN
    RAISE EXCEPTION 'Public table inventory drift: review all new tables before installing integration isolation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND NOT c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Every public table must have RLS enabled';
  END IF;

  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=t
        AND policyname LIKE 'chatgpt_iso_%'
    ) THEN
      RAISE EXCEPTION 'An integration isolation policy already exists on %',t;
    END IF;
    read_guard := CASE t
      WHEN 'profiles' THEN format(
        '(%s OR (id = auth.uid() AND is_active = true AND role = ''member''))',
        guard)
      WHEN 'projects' THEN format(
        '(%s OR (id = %L::uuid AND is_active = true))',
        guard,seo_project_id)
      WHEN 'tasks' THEN format(
        '(%s OR (project_id = %L::uuid AND is_archived = false))',
        guard,seo_project_id)
      ELSE guard
    END;

    -- Restrictive policies are combined with existing permissive policies
    -- using AND: employee access stays unchanged, integration only narrows.
    EXECUTE format(
      'CREATE POLICY chatgpt_iso_select ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (%s)',
      t,read_guard
    );
    EXECUTE format(
      'CREATE POLICY chatgpt_iso_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)',
      t,guard
    );
    EXECUTE format(
      'CREATE POLICY chatgpt_iso_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      t,guard,guard
    );
    EXECUTE format(
      'CREATE POLICY chatgpt_iso_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (%s)',
      t,guard
    );
  END LOOP;
END
$policy$;
