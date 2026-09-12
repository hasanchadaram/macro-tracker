-- Migration 036: Revert meal_entries, meal_food, daily_summaries, recent_foods to UTC (timestamptz)
-- =================================================================================================

-- 1. Conditionally convert columns back to timestamptz (if they were converted to timestamp without time zone)
DO $$
BEGIN
  -- meal_entries
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'meal_entries' 
      AND column_name = 'created_at' AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE public.meal_entries 
      ALTER COLUMN created_at TYPE timestamp with time zone 
      USING created_at AT TIME ZONE 'Asia/Kolkata';

    ALTER TABLE public.meal_entries 
      ALTER COLUMN updated_at TYPE timestamp with time zone 
      USING updated_at AT TIME ZONE 'Asia/Kolkata';
  END IF;

  -- meal_food
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'meal_food' 
      AND column_name = 'created_at' AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE public.meal_food 
      ALTER COLUMN created_at TYPE timestamp with time zone 
      USING created_at AT TIME ZONE 'Asia/Kolkata';
  END IF;

  -- daily_summaries
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'daily_summaries' 
      AND column_name = 'updated_at' AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE public.daily_summaries 
      ALTER COLUMN updated_at TYPE timestamp with time zone 
      USING updated_at AT TIME ZONE 'Asia/Kolkata';
  END IF;

  -- recent_foods
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'recent_foods' 
      AND column_name = 'last_used_at' AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE public.recent_foods 
      ALTER COLUMN last_used_at TYPE timestamp with time zone 
      USING last_used_at AT TIME ZONE 'Asia/Kolkata';
  END IF;
END $$;

-- 2. Reset defaults to UTC now()
ALTER TABLE public.meal_entries 
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.meal_food 
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.daily_summaries 
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.recent_foods 
  ALTER COLUMN last_used_at SET DEFAULT now();

-- 3. Drop the 15-parameter insert_meal_transaction overload
DROP FUNCTION IF EXISTS public.insert_meal_transaction(text, text, numeric, numeric, numeric, numeric, text, jsonb, jsonb, jsonb, text, uuid, date, timestamp without time zone, text);

-- 4. Restore standard 13-parameter insert_meal_transaction (UTC)
CREATE OR REPLACE FUNCTION public.insert_meal_transaction(
  p_meal_type text,
  p_meal_name text,
  p_calories numeric,
  p_protein numeric,
  p_carbs numeric,
  p_fat numeric,
  p_image_path text,
  p_raw_input jsonb,
  p_ai_response_json jsonb,
  p_foods jsonb, -- Array of food item objects
  p_title text DEFAULT NULL,
  p_meal_id uuid DEFAULT NULL,
  p_summary_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_meal_id uuid;
  v_food jsonb;
  v_meal_entry record;
  v_target_date date;
  v_recent record;
  v_meal_count integer;
  v_sum_cals numeric;
  v_sum_pro numeric;
  v_sum_carbs numeric;
  v_sum_fat numeric;
  v_sum_count integer;
  v_valid_foods jsonb := '[]'::jsonb;
BEGIN
  -- Check authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate positive calories
  IF COALESCE(p_calories, 0) <= 0 THEN
    RAISE EXCEPTION 'Cannot log a meal with 0 calories.';
  END IF;

  -- Target summary date: use client-supplied local date if provided, else fallback to UTC date
  v_target_date := COALESCE(p_summary_date, (now() AT TIME ZONE 'UTC')::date);

  -- IDEMPOTENCY CHECK: If p_meal_id is provided and already exists for this user, replay result safely
  IF p_meal_id IS NOT NULL THEN
    SELECT * INTO v_meal_entry
    FROM public.meal_entries
    WHERE id = p_meal_id AND user_id = v_user_id;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'meal_id', v_meal_entry.id,
        'entry', row_to_json(v_meal_entry),
        'idempotent_replay', true
      );
    END IF;
  END IF;

  -- ATOMIC MEAL LIMIT CHECK: Ensure user doesn't exceed 5 entries per meal type per day
  SELECT COUNT(*) INTO v_meal_count
  FROM public.meal_entries
  WHERE user_id = v_user_id 
    AND meal_type = p_meal_type 
    AND summary_date = v_target_date;

  IF v_meal_count >= 5 THEN
    RAISE EXCEPTION 'You can only add a maximum of 5 entries for % today.', p_meal_type;
  END IF;

  -- 1. Insert into meal_entries (using client UUID if provided, else generate one)
  v_meal_id := COALESCE(p_meal_id, gen_random_uuid());

  INSERT INTO public.meal_entries (
    id, user_id, meal_type, meal_name, title, calories, protein, carbs, fat, 
    image_path, raw_input, ai_provider, ai_response_json, summary_date
  ) VALUES (
    v_meal_id, v_user_id, p_meal_type, p_meal_name, COALESCE(p_title, p_meal_name), p_calories, p_protein, p_carbs, p_fat,
    p_image_path, p_raw_input, 'google', p_ai_response_json, v_target_date
  ) RETURNING * INTO v_meal_entry;

  -- 2. Insert into meal_food (filtering out any zero-calorie or zero-quantity foods)
  IF jsonb_typeof(p_foods) = 'array' THEN
    FOR v_food IN SELECT * FROM jsonb_array_elements(p_foods)
    LOOP
      IF COALESCE((v_food->>'calories')::numeric, 0) > 0 AND COALESCE((v_food->>'quantity')::numeric, 0) > 0 THEN
        INSERT INTO public.meal_food (
          user_id, meal_id, name, quantity, unit, calories, protein_g, carbs_g, fat_g
        ) VALUES (
          v_user_id,
          v_meal_id,
          (v_food->>'name')::text,
          (v_food->>'quantity')::numeric,
          (v_food->>'unit')::text,
          (v_food->>'calories')::numeric,
          (v_food->>'protein_g')::numeric,
          (v_food->>'carbs_g')::numeric,
          (v_food->>'fat_g')::numeric
        );
        v_valid_foods := v_valid_foods || jsonb_build_array(v_food);
      END IF;
    END LOOP;
  END IF;

  -- 3. Idempotent True-Sum Daily Summaries Aggregation for v_target_date
  SELECT 
    COALESCE(SUM(calories), 0),
    COALESCE(SUM(protein), 0),
    COALESCE(SUM(carbs), 0),
    COALESCE(SUM(fat), 0),
    COUNT(*)
  INTO v_sum_cals, v_sum_pro, v_sum_carbs, v_sum_fat, v_sum_count
  FROM public.meal_entries
  WHERE user_id = v_user_id AND summary_date = v_target_date;

  INSERT INTO public.daily_summaries (
    user_id, summary_date, total_calories, total_protein, total_carbs, total_fat, total_fiber, meal_count, updated_at
  ) VALUES (
    v_user_id, v_target_date, v_sum_cals, v_sum_pro, v_sum_carbs, v_sum_fat, 0, v_sum_count, now()
  )
  ON CONFLICT (user_id, summary_date) DO UPDATE SET
    total_calories = EXCLUDED.total_calories,
    total_protein  = EXCLUDED.total_protein,
    total_carbs    = EXCLUDED.total_carbs,
    total_fat      = EXCLUDED.total_fat,
    meal_count     = EXCLUDED.meal_count,
    updated_at     = now();

  -- 4. Upsert recent_foods (storing only valid positive foods)
  SELECT * INTO v_recent
  FROM public.recent_foods
  WHERE user_id = v_user_id AND meal_name ILIKE p_meal_name
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.recent_foods
    SET
      foods = v_valid_foods,
      total_calories = p_calories,
      total_protein = p_protein,
      total_carbs = p_carbs,
      total_fat = p_fat,
      used_count = used_count + 1,
      last_used_at = now()
    WHERE id = v_recent.id;
  ELSE
    INSERT INTO public.recent_foods (
      user_id, meal_name, foods, total_calories, total_protein, total_carbs, total_fat, used_count, last_used_at
    ) VALUES (
      v_user_id, p_meal_name, v_valid_foods, p_calories, p_protein, p_carbs, p_fat, 1, now()
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'meal_id', v_meal_id,
    'entry', row_to_json(v_meal_entry),
    'idempotent_replay', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_meal_transaction(text, text, numeric, numeric, numeric, numeric, text, jsonb, jsonb, jsonb, text, uuid, date) TO authenticated;

-- 5. Restore standard delete_meal_entry (UTC)
CREATE OR REPLACE FUNCTION public.delete_meal_entry(p_meal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_entry record;
  v_entry_date date;
  v_sum_cals numeric;
  v_sum_pro numeric;
  v_sum_carbs numeric;
  v_sum_fat numeric;
  v_sum_count integer;
BEGIN
  -- Check authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify existence and ownership
  SELECT * INTO v_entry
  FROM public.meal_entries
  WHERE id = p_meal_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    -- If already deleted, return success idempotently
    RETURN jsonb_build_object('success', true, 'idempotent_replay', true);
  END IF;

  v_entry_date := COALESCE(v_entry.summary_date, (v_entry.created_at AT TIME ZONE 'UTC')::date);

  -- Delete the meal entry (meal_food deleted automatically via cascade)
  DELETE FROM public.meal_entries
  WHERE id = p_meal_id AND user_id = v_user_id;

  -- Recalculate daily summary from remaining meal entries for that date
  SELECT 
    COALESCE(SUM(calories), 0),
    COALESCE(SUM(protein), 0),
    COALESCE(SUM(carbs), 0),
    COALESCE(SUM(fat), 0),
    COUNT(*)
  INTO v_sum_cals, v_sum_pro, v_sum_carbs, v_sum_fat, v_sum_count
  FROM public.meal_entries
  WHERE user_id = v_user_id AND summary_date = v_entry_date;

  INSERT INTO public.daily_summaries (
    user_id, summary_date, total_calories, total_protein, total_carbs, total_fat, total_fiber, meal_count, updated_at
  ) VALUES (
    v_user_id, v_entry_date, v_sum_cals, v_sum_pro, v_sum_carbs, v_sum_fat, 0, v_sum_count, now()
  )
  ON CONFLICT (user_id, summary_date) DO UPDATE SET
    total_calories = EXCLUDED.total_calories,
    total_protein  = EXCLUDED.total_protein,
    total_carbs    = EXCLUDED.total_carbs,
    total_fat      = EXCLUDED.total_fat,
    meal_count     = EXCLUDED.meal_count,
    updated_at     = now();

  RETURN jsonb_build_object('success', true, 'idempotent_replay', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_meal_entry(uuid) TO authenticated;
