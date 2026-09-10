-- =============================================================================
-- Migration 031: Remove ai_model from meal_entries, Set BYOK Default AI Model
-- 1. Drops unused ai_model column from meal_entries table
-- 2. Updates insert_meal_transaction RPC without ai_model
-- 3. Updates update_custom_api_key RPC to set ai_model='gemini-3.7-flash' for BYOK
-- =============================================================================

-- 1. Drop unused ai_model column from meal_entries
ALTER TABLE public.meal_entries DROP COLUMN IF EXISTS ai_model;

-- 2. Update insert_meal_transaction to remove ai_model insertion
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

-- 3. Update update_custom_api_key RPC
-- Resets ai_model to NULL on key change so scan-food dynamically binds
-- the active BYOK_DEFAULT_AI_MODEL from the server environment configuration
CREATE OR REPLACE FUNCTION public.update_custom_api_key(new_key text)
RETURNS void AS $$
DECLARE
  v_user_id uuid;
  v_clean_key text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_clean_key := NULLIF(trim(new_key), '');

  IF v_clean_key IS NOT NULL THEN
    INSERT INTO public.user_ai_settings (user_id, custom_api_key, ai_model, byok_enabled, updated_at)
    VALUES (v_user_id, v_clean_key, NULL, true, now())
    ON CONFLICT (user_id) DO UPDATE
    SET custom_api_key = EXCLUDED.custom_api_key,
        ai_model = NULL,
        byok_enabled = true,
        updated_at = now();
  ELSE
    UPDATE public.user_ai_settings
    SET custom_api_key = NULL,
        ai_model = NULL,
        byok_enabled = false,
        updated_at = now()
    WHERE user_id = v_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update new user trigger to initialize ai_model as NULL
-- This allows scan-food to dynamically assign the model from server configuration on first scan
CREATE OR REPLACE FUNCTION public.handle_new_user_ai_model()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_ai_settings (user_id, ai_model, byok_enabled)
  VALUES (new.id, NULL, true)
  ON CONFLICT (user_id) DO UPDATE SET 
    byok_enabled = EXCLUDED.byok_enabled;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Mark existing non-override models with CONFIG_ prefix so they are recognized as config-managed
UPDATE public.user_ai_settings
SET ai_model = 'CONFIG_' || ai_model
WHERE ai_model IS NOT NULL AND ai_model NOT LIKE 'CONFIG_%';

