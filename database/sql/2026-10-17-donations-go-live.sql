-- =====================================================
-- JEE ADV OSINT — Donations "go live" (2026-10-17)
-- Purpose: bring the vpvvvftxigffgmmhagett project up to the state the
-- payment feature expects. The v2.4.0 frontend sync shipped the support
-- page + hall-of-support, but this project never received the matching
-- DB objects, so every payment attempt failed at create-razorpay-order.
--
-- Run in: Supabase Dashboard → SQL Editor → paste → Run
-- Idempotent: safe to run multiple times.
-- =====================================================

-- ── 1. DONATIONS TABLE ──
-- Written only by verify-razorpay-payment / razorpay-webhook edge
-- functions (service role — bypasses RLS). No client-facing policies
-- on purpose; public reads go through the SECURITY DEFINER RPCs below.
create table if not exists public.donations (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  amount numeric not null,
  currency text default 'INR',
  razorpay_order_id text,
  razorpay_payment_id text,
  status text default 'created',
  display_name text,
  show_publicly boolean default true,
  email text,
  note text,
  email_sent boolean default false,
  created_at timestamptz default now()
);

alter table public.donations enable row level security;

-- Unique payment id — REQUIRED: verify-razorpay-payment and the webhook
-- both upsert with `on_conflict=razorpay_payment_id`, which 409s without it.
create unique index if not exists donations_razorpay_payment_id_key
  on public.donations (razorpay_payment_id);

create index if not exists donations_order_id_idx
  on public.donations (razorpay_order_id);

create index if not exists donations_status_idx
  on public.donations (status);

-- ── 2. PUBLIC RPCs (Hall of Support + badge) ──

CREATE OR REPLACE FUNCTION public.get_community_impact_stats()
 RETURNS TABLE(supporter_count bigint, chais_bought bigint, supporting_since timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COUNT(DISTINCT COALESCE(user_id::text, id::text)) AS supporter_count,
    COUNT(*) AS chais_bought,
    MIN(created_at) AS supporting_since
  FROM public.donations
  WHERE status = 'paid';
$function$;

CREATE OR REPLACE FUNCTION public.get_hall_of_support()
 RETURNS TABLE(supporter_key text, display_name text, badge_tier text, first_contribution_at timestamp with time zone, last_contribution_at timestamp with time zone)
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
      (ARRAY_AGG(show_publicly ORDER BY created_at DESC))[1] AS latest_show_publicly
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
      show_publicly AS latest_show_publicly
    FROM paid
    WHERE user_id IS NULL
  ),
  combined AS (
    SELECT user_id, NULL::bigint AS anon_id, max_amount, first_contribution_at, last_contribution_at, latest_display_name, latest_show_publicly FROM per_user
    UNION ALL
    SELECT user_id, anon_id, max_amount, first_contribution_at, last_contribution_at, latest_display_name, latest_show_publicly FROM anon_rows
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
    last_contribution_at
  FROM combined;
$function$;

-- Caller looking up their OWN badge (identity-checked, not trusting input).
CREATE OR REPLACE FUNCTION public.get_my_badge(p_user_id uuid)
 RETURNS TABLE(badge_tier text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    CASE
      WHEN MAX(amount) >= 499 THEN 'Diamond Supporter'
      WHEN MAX(amount) >= 199 THEN 'Gold Supporter'
      WHEN MAX(amount) >= 99  THEN 'Silver Supporter'
      ELSE 'Bronze Supporter'
    END AS badge_tier
  FROM public.donations
  WHERE user_id = p_user_id
    AND status = 'paid'
    AND (auth.uid() = p_user_id OR auth.role() = 'service_role')
  HAVING COUNT(*) > 0;
$function$;

-- Claims pre-signup ("guest") donations matching the caller's own
-- verified email. Self-scoped via auth.email()/auth.uid().
CREATE OR REPLACE FUNCTION public.claim_guest_donations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  claimed_count integer;
  caller_email text;
BEGIN
  caller_email := auth.email();
  IF caller_email IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.donations
  SET user_id = auth.uid()
  WHERE user_id IS NULL
    AND status = 'paid'
    AND email IS NOT NULL
    AND lower(email) = lower(caller_email);

  GET DIAGNOSTICS claimed_count = ROW_COUNT;
  RETURN claimed_count;
END;
$function$;

-- ── 3. EXECUTE GRANTS for the public RPCs ──
GRANT EXECUTE ON FUNCTION public.get_community_impact_stats() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_hall_of_support() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_guest_donations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_badge(uuid) TO anon, authenticated;

-- Done. Next steps to take payments live (done outside SQL Editor):
--   1. Deploy edge functions: create-razorpay-order, verify-razorpay-payment,
--      check-payment-status, razorpay-webhook (verify_jwt = false for webhook)
--   2. Set secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
--   3. In Razorpay Dashboard → Settings → Webhooks: add
--      https://vpvvftxigffgmmhagett.supabase.co/functions/v1/razorpay-webhook
--      event "payment.captured" (+ "payment.failed"), then set the
--      generated webhook secret as RAZORPAY_WEBHOOK_SECRET
