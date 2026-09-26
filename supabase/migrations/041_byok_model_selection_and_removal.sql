-- =============================================================================
-- Migration 041: BYOK Model Selection and Key Removal
-- 1. Adds remove_custom_api_key() RPC to safely remove user's custom API key
--    and reset ai_model, falling back cleanly to free tier while keeping byok_enabled true
-- 2. Adds update_byok_model(new_model text) RPC to let BYOK users choose their Gemini model
-- 3. Updates get_ai_settings() RPC to return selected_model
-- 4. Updates update_custom_api_key(new_key text) RPC to keep byok_enabled true on key clear
-- =============================================================================

-- 0. Allow ai_model to be NULL for default/unassigned states
ALTER TABLE public.user_ai_settings ALTER COLUMN ai_model DROP NOT NULL;

-- 1. Create remove_custom_api_key RPC
CREATE OR REPLACE FUNCTION public.remove_custom_api_key()
RETURNS void AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.user_ai_settings
  SET custom_api_key = NULL,
      ai_model = NULL,
      byok_enabled = true,
      updated_at = now()
  WHERE user_id = v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.remove_custom_api_key() TO authenticated;

-- 2. Create update_byok_model RPC
CREATE OR REPLACE FUNCTION public.update_byok_model(new_model text)
RETURNS void AS $$
DECLARE
  v_user_id uuid;
  v_clean_model text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify user has an active custom API key
  IF NOT EXISTS (
    SELECT 1 FROM public.user_ai_settings 
    WHERE user_id = v_user_id AND custom_api_key IS NOT NULL AND trim(custom_api_key) <> ''
  ) THEN
    RAISE EXCEPTION 'Custom API key required to choose an AI model';
  END IF;

  v_clean_model := NULLIF(trim(new_model), '');
  IF v_clean_model IS NULL THEN
    RAISE EXCEPTION 'Model name cannot be empty';
  END IF;

  -- Validate against allowed list of Gemini models
  IF v_clean_model NOT IN (
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-pro',
    'gemini-2.5-flash'
  ) THEN
    RAISE EXCEPTION 'Invalid AI model: %', v_clean_model;
  END IF;

  -- Save clean model name without CONFIG_ prefix (treated as manual override by scan-food)
  UPDATE public.user_ai_settings
  SET ai_model = v_clean_model,
      updated_at = now()
  WHERE user_id = v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_byok_model(text) TO authenticated;

-- 3. Update get_ai_settings() RPC to return selected_model
CREATE OR REPLACE FUNCTION public.get_ai_settings()
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_record record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT 
    byok_enabled, 
    (custom_api_key IS NOT NULL AND trim(custom_api_key) <> '') as has_custom_key,
    CASE 
      WHEN ai_model LIKE 'CONFIG_%' THEN substring(ai_model from 8)
      ELSE ai_model
    END as current_model
  INTO v_record
  FROM public.user_ai_settings
  WHERE user_id = v_user_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'byok_enabled', COALESCE(v_record.byok_enabled, true),
      'has_custom_key', COALESCE(v_record.has_custom_key, false),
      'selected_model', v_record.current_model
    );
  ELSE
    RETURN jsonb_build_object(
      'byok_enabled', true,
      'has_custom_key', false,
      'selected_model', NULL
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_ai_settings() TO authenticated;

-- 4. Update update_custom_api_key(new_key text) RPC to keep byok_enabled true on key clear
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
        byok_enabled = true,
        updated_at = now()
    WHERE user_id = v_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_custom_api_key(text) TO authenticated;
