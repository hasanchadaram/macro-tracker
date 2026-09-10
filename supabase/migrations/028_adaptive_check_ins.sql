-- =============================================================================
-- Migration 028: Adaptive Nutrition Check-Ins & Weekly Target Adjustments
-- Adds check_ins table and profile tracking for 7-day adaptive coaching
-- =============================================================================

-- 1. Add adaptive tracking columns to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS last_check_in_date date,
ADD COLUMN IF NOT EXISTS trend_weight_kg numeric;

-- 2. Create check_ins table
CREATE TABLE IF NOT EXISTS public.check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  check_in_date date NOT NULL,
  scale_weight numeric NOT NULL,
  trend_weight numeric NOT NULL,
  previous_trend_weight numeric,
  days_logged integer NOT NULL DEFAULT 0,
  average_calories numeric,
  status text NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted', 'kept_current', 'skipped')),
  action_type text NOT NULL CHECK (action_type IN ('hold', 'decrease', 'proactive_trim', 'increase', 'floor_reached', 'adherence_warning')),
  old_calories numeric,
  new_calories numeric,
  old_protein numeric,
  new_protein numeric,
  old_carbs numeric,
  new_carbs numeric,
  old_fat numeric,
  new_fat numeric,
  coach_message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Enable RLS on check_ins
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for check_ins
DROP POLICY IF EXISTS "Users can view their own check-ins" ON public.check_ins;
CREATE POLICY "Users can view their own check-ins"
  ON public.check_ins
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own check-ins" ON public.check_ins;
CREATE POLICY "Users can insert their own check-ins"
  ON public.check_ins
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own check-ins" ON public.check_ins;
CREATE POLICY "Users can update their own check-ins"
  ON public.check_ins
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Performance Index
CREATE INDEX IF NOT EXISTS idx_check_ins_user_date
  ON public.check_ins (user_id, check_in_date DESC);
