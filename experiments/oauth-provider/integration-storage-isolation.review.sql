-- REVIEW ONLY. DO NOT RUN ON THE LIVE SUPABASE PROJECT.
-- Tested with a synthetic, disposable PostgreSQL storage.objects fixture.
-- Storage is Supabase-managed; applying this requires explicit DBA review.
-- This matches the integration UUID used by integration-rls-isolation.review.sql.
DO $storage_policy$
DECLARE
  integration_id uuid := 'f0000000-0000-4000-8000-000000000001';
  guard text := format('(auth.uid() IS DISTINCT FROM %L::uuid)', integration_id);
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'No storage.objects table: cannot verify storage isolation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid = 'storage.objects'::regclass AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'storage.objects must have RLS enabled';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname LIKE 'chatgpt_iso_%'
  ) THEN
    RAISE EXCEPTION 'Storage integration isolation policy already exists';
  END IF;

  -- RESTRICTIVE policies AND with existing policies. Employees retain
  -- their existing permissions; integration cannot read, upload, replace,
  -- move or delete any storage object even in a folder it owns.
  EXECUTE format(
    'CREATE POLICY chatgpt_iso_select ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING (%s)',
    guard
  );
  EXECUTE format(
    'CREATE POLICY chatgpt_iso_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)',
    guard
  );
  EXECUTE format(
    'CREATE POLICY chatgpt_iso_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
    guard, guard
  );
  EXECUTE format(
    'CREATE POLICY chatgpt_iso_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING (%s)',
    guard
  );
END
$storage_policy$;
