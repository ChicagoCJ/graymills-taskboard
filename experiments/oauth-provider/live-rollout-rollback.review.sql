-- REVIEW ONLY. DO NOT RUN ON LIVE SUPABASE WITHOUT AN APPROVED
-- CHANGE WINDOW, COMPLETE POLICY REVIEW, AND VERIFIED BACKUP.
-- Roll back ONLY the integration-isolation policies created by this project.
-- Does not undo other policies, grants, or employee account changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';
DO $rollback$
DECLARE
  t text;
  tables text[] := ARRAY[
    'activity_log','custom_fields','notification_dismissals',
    'notification_preferences','profiles','project_teams','projects',
    'tags','task_assignees','task_attachments','task_comments',
    'task_custom_field_values','task_subtasks','task_tags','tasks',
    'team_members','teams','user_integrations'
  ];
  suffix text;
  suffixes text[] := ARRAY['select','insert','update','delete'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    FOREACH suffix IN ARRAY suffixes LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
        'chatgpt_iso_' || suffix, t);
    END LOOP;
  END LOOP;
  FOREACH suffix IN ARRAY suffixes LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects',
      'chatgpt_iso_' || suffix);
  END LOOP;
END
$rollback$;
COMMIT;

-- After rollback:
-- - Re-run employee regression and direct PostgREST/storage checks.
-- - Disable the OAuth resource bridge/deploy flag and revoke the
--   integration user's sessions BEFORE rolling back restrictions.
-- - Never leave the dedicated integration login functional without RLS.
