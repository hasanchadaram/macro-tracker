-- =============================================================================
-- Migration 026: Update Goal Option from 'Gain weight' to 'Gain Muscle'
-- =============================================================================

-- 1. Drop existing check constraint on profiles.goal safely
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.profiles'::regclass 
          AND contype = 'c' 
          AND pg_get_constraintdef(oid) ILIKE '%goal%'
    ) LOOP
        EXECUTE 'ALTER TABLE public.profiles DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- 2. Update existing records in public.profiles
UPDATE public.profiles 
SET goal = 'Gain Muscle' 
WHERE goal = 'Gain weight';

-- 3. Add updated check constraint supporting 'Gain Muscle' (and 'Gain weight' for backwards compatibility)
ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_goal_check 
CHECK (goal IN ('Lose weight', 'Maintain weight', 'Gain Muscle', 'Gain weight', 'Just track my food'));
