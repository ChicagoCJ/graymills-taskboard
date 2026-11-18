-- Source: read-only inspection of live TaskBoard pg_policies / pg_get_functiondef,
-- 2026-11-16. NO customer records, credentials, or production user information.
-- For use only inside disposable PostgreSQL replay fixture.
-- Scope: exact live baseline of profiles, projects, tasks, task_assignees,
-- storage.objects and six access-control functions. Other tables are not cloned.

CREATE OR REPLACE FUNCTION public.can_see_task(task_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    public.is_admin_or_manager()
    or exists (
      select 1
      from public.task_assignees ta
      where ta.task_id = task_uuid
        and ta.profile_id = auth.uid()
    )
    or exists (
      select 1
      from public.task_assignees ta
      join public.team_members tm
        on tm.team_id = ta.team_id
      where ta.task_id = task_uuid
        and tm.profile_id = auth.uid()
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_active_user()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active = true
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and is_active = true
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_admin() or public.is_manager();
$function$
;

CREATE OR REPLACE FUNCTION public.is_manager()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'manager'
      and is_active = true
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_task_assignee(task_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.can_see_task(task_uuid);
$function$
;

CREATE POLICY "Admins can insert profiles" ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can read all profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Admins can update all profiles" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Managers can read profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_manager());
CREATE POLICY "Users can read their own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((id = auth.uid()));
CREATE POLICY "Users can update their own profile basics" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (((id = auth.uid()) AND is_active_user())) WITH CHECK (((id = auth.uid()) AND is_active_user()));
CREATE POLICY "Admins can manage projects" ON public.projects AS PERMISSIVE FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Managers can create projects" ON public.projects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin_or_manager());
CREATE POLICY "Managers can read projects" ON public.projects AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_manager());
CREATE POLICY "Managers can update projects" ON public.projects AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin_or_manager()) WITH CHECK (is_admin_or_manager());
CREATE POLICY "Members can read active projects" ON public.projects AS PERMISSIVE FOR SELECT TO authenticated USING ((is_active = true));
CREATE POLICY "Admins can manage task assignees" ON public.task_assignees AS PERMISSIVE FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Members can read their task assignments" ON public.task_assignees AS PERMISSIVE FOR SELECT TO authenticated USING ((is_active_user() AND (is_admin() OR (profile_id = auth.uid()) OR can_see_task(task_id))));
CREATE POLICY "Users can assign tasks to themselves" ON public.task_assignees AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_active_user() AND (is_admin() OR (profile_id = auth.uid()) OR can_see_task(task_id))));
CREATE POLICY "Admins can manage tasks" ON public.tasks AS PERMISSIVE FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Members can read assigned tasks" ON public.tasks AS PERMISSIVE FOR SELECT TO authenticated USING ((is_active_user() AND can_see_task(id)));
CREATE POLICY "Members can update assigned tasks" ON public.tasks AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_active_user() AND can_see_task(id))) WITH CHECK ((is_active_user() AND can_see_task(id)));
CREATE POLICY "Users can create tasks as themselves" ON public.tasks AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_active_user() AND (created_by_profile_id = auth.uid())));
CREATE POLICY "Task attachments delete own or admin" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'task-attachments'::text) AND (is_admin() OR ((storage.foldername(name))[1] = (auth.uid())::text))));
CREATE POLICY "Task attachments read permitted task files" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'task-attachments'::text) AND (EXISTS ( SELECT 1
   FROM task_attachments ta
  WHERE ((ta.file_path = objects.name) AND (is_admin() OR is_task_assignee(ta.task_id) OR (ta.uploaded_by_profile_id = auth.uid())))))));
CREATE POLICY "Task attachments upload own folder" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'task-attachments'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
