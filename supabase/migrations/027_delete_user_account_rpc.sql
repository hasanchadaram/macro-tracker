-- =============================================================================
-- Migration 027: Delete User Account RPC
-- Permanently erases the calling authenticated user's account and all associated data
-- =============================================================================

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- 1. Verify authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Explicitly delete from public tables
  -- Note: Foreign keys reference auth.users(id) ON DELETE CASCADE,
  -- but explicit deletion ensures full cleanup.
  DELETE FROM public.feedback_submissions WHERE user_id = v_user_id;
  DELETE FROM public.exercises WHERE user_id = v_user_id;
  DELETE FROM public.weight_logs WHERE user_id = v_user_id;
  DELETE FROM public.recent_foods WHERE user_id = v_user_id;
  DELETE FROM public.meal_food WHERE user_id = v_user_id;
  DELETE FROM public.meal_entries WHERE user_id = v_user_id;
  DELETE FROM public.daily_summaries WHERE user_id = v_user_id;
  DELETE FROM public.user_goals WHERE user_id = v_user_id;
  DELETE FROM public.user_ai_settings WHERE user_id = v_user_id;
  DELETE FROM public.profiles WHERE id = v_user_id;

  -- 3. Delete the user identity from auth.users
  DELETE FROM auth.users WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'User account and all associated data have been permanently deleted.'
  );
END;
$$;

-- Revoke from anon and allow authenticated
REVOKE ALL ON FUNCTION public.delete_user_account() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
