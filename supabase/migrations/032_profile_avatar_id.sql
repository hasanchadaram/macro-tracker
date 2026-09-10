-- =============================================================================
-- Migration 032: Add avatar_id to public.profiles
-- Allows users to choose an avatar (Konosuba anime characters or default Google avatar)
-- =============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_id text DEFAULT 'default';
