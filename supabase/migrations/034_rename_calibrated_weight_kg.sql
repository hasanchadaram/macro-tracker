-- =============================================================================
-- Migration 034: Rename protein_weight_kg to calibrated_weight_kg
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'profiles' 
      AND column_name = 'protein_weight_kg'
  ) THEN
    ALTER TABLE public.profiles RENAME COLUMN protein_weight_kg TO calibrated_weight_kg;
  ELSE
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS calibrated_weight_kg numeric;
  END IF;
END $$;
