-- 2026-10-18 — Hall of Support: surface the supporter note (completes the
-- note feature: UI collected it, donations.note column existed, but no write
-- path and no read path ever touched it).
-- NOTE: return-type change -> must DROP first (42P13), then recreate + re-grant.
DROP FUNCTION IF EXISTS public.get_hall_of_support();

CREATE OR REPLACE FUNCTION public.get_hall_of_support()
 RETURNS TABLE(supporter_key text, display_name text, badge_tier text, first_contribution_at timestamp with time zone, last_contribution_at timestamp with time zone, note text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH paid AS (
    SELECT * FROM public.donations WHERE status = 'paid'
  ),
  per_user AS (
    SELECT
      user_id,
      MAX(amount) AS max_amount,
      MIN(created_at) AS first_contribution_at,
      MAX(created_at) AS last_contribution_at,
      (ARRAY_AGG(display_name ORDER BY created_at DESC))[1] AS latest_display_name,
      (ARRAY_AGG(show_publicly ORDER BY created_at DESC))[1] AS latest_show_publicly,
      (ARRAY_AGG(note ORDER BY created_at DESC))[1] AS latest_note
    FROM paid
    WHERE user_id IS NOT NULL
    GROUP BY user_id
  ),
  anon_rows AS (
    SELECT
      NULL::uuid AS user_id,
      id AS anon_id,
      amount AS max_amount,
      created_at AS first_contribution_at,
      created_at AS last_contribution_at,
      display_name AS latest_display_name,
      show_publicly AS latest_show_publicly,
      note AS latest_note
    FROM paid
    WHERE user_id IS NULL
  ),
  combined AS (
    SELECT user_id, NULL::bigint AS anon_id, max_amount, first_contribution_at, last_contribution_at, latest_display_name, latest_show_publicly, latest_note FROM per_user
    UNION ALL
    SELECT user_id, anon_id, max_amount, first_contribution_at, last_contribution_at, latest_display_name, latest_show_publicly, latest_note FROM anon_rows
  )
  SELECT
    COALESCE(user_id::text, 'anon-' || anon_id::text) AS supporter_key,
    CASE WHEN latest_show_publicly IS FALSE THEN NULL ELSE NULLIF(TRIM(latest_display_name), '') END AS display_name,
    CASE
      WHEN max_amount >= 499 THEN 'Diamond Supporter'
      WHEN max_amount >= 199 THEN 'Gold Supporter'
      WHEN max_amount >= 99  THEN 'Silver Supporter'
      ELSE 'Bronze Supporter'
    END AS badge_tier,
    first_contribution_at,
    last_contribution_at,
    CASE WHEN latest_show_publicly IS FALSE THEN NULL ELSE NULLIF(TRIM(latest_note), '') END AS note
  FROM combined;
$function$;

GRANT EXECUTE ON FUNCTION public.get_hall_of_support() TO anon, authenticated, service_role;
