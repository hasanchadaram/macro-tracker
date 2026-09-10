-- =============================================================================
-- Migration 030: Add weight_delta_kg and rate_percent to check_ins table
-- Preserves exact rate and delta values evaluated during check-ins
-- =============================================================================

ALTER TABLE public.check_ins
ADD COLUMN IF NOT EXISTS weight_delta_kg numeric,
ADD COLUMN IF NOT EXISTS rate_percent numeric;
