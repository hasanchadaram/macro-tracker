-- =============================================================================
-- Migration 039: User Foods RPCs
-- search_global_foods, search_my_foods, upsert_user_food,
-- delete_user_food, record_food_use
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Search global food catalog (full-text search)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_global_foods(
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS SETOF public.global_foods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT *
    FROM public.global_foods
    WHERE
      to_tsvector('english', name) @@ plainto_tsquery('english', p_query)
      OR name ILIKE '%' || p_query || '%'
      OR EXISTS (
        SELECT 1 FROM unnest(name_aliases) AS alias
        WHERE alias ILIKE '%' || p_query || '%'
      )
    ORDER BY
      ts_rank(to_tsvector('english', name), plainto_tsquery('english', p_query)) DESC,
      name ASC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_global_foods(text, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Search user's personal food library (full-text + ILIKE)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_my_foods(
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS SETOF public.user_foods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
    SELECT *
    FROM public.user_foods
    WHERE user_id = v_user_id
      AND (
        to_tsvector('english', name) @@ plainto_tsquery('english', p_query)
        OR name ILIKE '%' || p_query || '%'
      )
    ORDER BY
      use_count DESC,
      last_used_at DESC NULLS LAST,
      name ASC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_my_foods(text, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Upsert user food (create or update)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_user_food(
  p_name text,
  p_per_100g jsonb,
  p_source text DEFAULT 'manual',
  p_notes text DEFAULT NULL,
  p_emoji text DEFAULT NULL,
  p_default_serving_g numeric DEFAULT NULL,
  p_default_serving_label text DEFAULT NULL,
  p_ingredients jsonb DEFAULT NULL,
  p_derived_from_global uuid DEFAULT NULL,
  p_derived_from_user uuid DEFAULT NULL,
  p_ai_estimated boolean DEFAULT false,
  p_ai_confidence numeric DEFAULT NULL,
  p_food_id uuid DEFAULT NULL  -- if provided, update existing
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_food_id uuid;
  v_result record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_food_id IS NOT NULL THEN
    -- Update existing food (verify ownership via RLS)
    UPDATE public.user_foods SET
      name = p_name,
      per_100g = p_per_100g,
      source = COALESCE(p_source, source),
      notes = p_notes,
      emoji = p_emoji,
      default_serving_g = p_default_serving_g,
      default_serving_label = p_default_serving_label,
      ingredients = p_ingredients,
      derived_from_global = COALESCE(p_derived_from_global, derived_from_global),
      derived_from_user = COALESCE(p_derived_from_user, derived_from_user),
      ai_estimated = p_ai_estimated,
      ai_confidence = p_ai_confidence,
      updated_at = now()
    WHERE id = p_food_id AND user_id = v_user_id
    RETURNING * INTO v_result;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Food not found or access denied';
    END IF;

    v_food_id := p_food_id;
  ELSE
    -- Create new food
    INSERT INTO public.user_foods (
      user_id, name, per_100g, source, notes, emoji,
      default_serving_g, default_serving_label, ingredients,
      derived_from_global, derived_from_user,
      ai_estimated, ai_confidence
    ) VALUES (
      v_user_id, p_name, p_per_100g, p_source, p_notes, p_emoji,
      p_default_serving_g, p_default_serving_label, p_ingredients,
      p_derived_from_global, p_derived_from_user,
      p_ai_estimated, p_ai_confidence
    )
    RETURNING * INTO v_result;

    v_food_id := v_result.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'food_id', v_food_id,
    'food', row_to_json(v_result)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_user_food(
  text, jsonb, text, text, text, numeric, text, jsonb, uuid, uuid, boolean, numeric, uuid
) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Delete user food
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_user_food(
  p_food_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.user_foods
  WHERE id = p_food_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Food not found or access denied';
  END IF;

  RETURN jsonb_build_object('success', true, 'deleted_id', p_food_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_food(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Record food use (bump use_count + last_used_at)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_food_use(
  p_food_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.user_foods
  SET use_count = use_count + 1,
      last_used_at = now(),
      updated_at = now()
  WHERE id = p_food_id AND user_id = v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_food_use(uuid) TO authenticated;
