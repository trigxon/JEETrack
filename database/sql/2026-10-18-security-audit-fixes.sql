-- 2026-10-18 — Security audit fixes (applied to production via Management API)
-- 1) CRITICAL: user_preferences had a policy "Service role can read all preferences"
--    created with roles={public} + USING(true) -> ANON could read every user's
--    email/username/class/target/goal/referral. service_role BYPASSES RLS anyway,
--    so this policy had no legitimate purpose. Dropped; verified anon now sees 0 rows.
DROP POLICY IF EXISTS "Service role can read all preferences" ON public.user_preferences;

-- 2) update_user_activity() is SECURITY DEFINER with mutable search_path
--    (Supabase linter: function_search_path_mutable). Recreated with fully
--    qualified table ref + SET search_path = ''.
CREATE OR REPLACE FUNCTION public.update_user_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
begin
  insert into public.user_preferences (user_id, last_active_at)
  values (COALESCE(auth.uid(), NEW.user_id), now())
  on conflict (user_id)
  do update set last_active_at = now(), updated_at = now();
  return new;
end;
$function$;

-- 3) Missing user_id indexes on per-user tables (every query filters WHERE user_id = auth.uid()).
CREATE INDEX IF NOT EXISTS idx_todos_user_id    ON public.todos    (user_id);
CREATE INDEX IF NOT EXISTS idx_tests_user_id    ON public.tests    (user_id);
CREATE INDEX IF NOT EXISTS idx_hours_user_id    ON public.hours    (user_id);
CREATE INDEX IF NOT EXISTS idx_backlogs_user_id ON public.backlogs (user_id);
CREATE INDEX IF NOT EXISTS idx_upcoming_user_id ON public.upcoming (user_id);
CREATE INDEX IF NOT EXISTS idx_syllabus_user_id ON public.syllabus (user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON public.feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_donations_user_id ON public.donations (user_id);
