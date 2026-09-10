-- =============================================================================
-- Migration 033: Add protein_multiplier and protein_weight_kg to profiles
-- Persists the user's calibrated protein multiplier and the weight baseline
-- against which their current protein target was calculated.
-- =============================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS protein_multiplier numeric,
ADD COLUMN IF NOT EXISTS protein_weight_kg numeric;

-- Backfill from latest accepted check_in if available, otherwise from profile
UPDATE public.profiles p
SET 
  protein_weight_kg = COALESCE(
    (
      SELECT ci.scale_weight 
      FROM public.check_ins ci 
      WHERE ci.user_id = p.id AND ci.status = 'accepted' 
      ORDER BY ci.check_in_date DESC, ci.created_at DESC 
      LIMIT 1
    ),
    p.weight_kg
  ),
  protein_multiplier = COALESCE(
    p.protein_multiplier,
    CASE 
      WHEN p.target_protein IS NOT NULL AND p.weight_kg IS NOT NULL AND p.weight_kg > 0
      THEN ROUND((p.target_protein / (
        COALESCE(
          (
            SELECT ci.scale_weight 
            FROM public.check_ins ci 
            WHERE ci.user_id = p.id AND ci.status = 'accepted' 
            ORDER BY ci.check_in_date DESC, ci.created_at DESC 
            LIMIT 1
          ),
          p.weight_kg
        )
      ))::numeric, 1)
      ELSE 2.0
    END
  );
