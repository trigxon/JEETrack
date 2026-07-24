-- =====================================================
-- Missing Onboarding Columns Fix
-- Run this in: Supabase → SQL Editor → Run
-- =====================================================

-- Add the missing columns to user_preferences
ALTER TABLE public.user_preferences 
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS class_year text,
  ADD COLUMN IF NOT EXISTS study_mode text,
  ADD COLUMN IF NOT EXISTS coaching text,
  ADD COLUMN IF NOT EXISTS target_year text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS onboarding_done boolean default false,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS referral_source text,
  ADD COLUMN IF NOT EXISTS goal_mains text,
  ADD COLUMN IF NOT EXISTS goal_adv text;
