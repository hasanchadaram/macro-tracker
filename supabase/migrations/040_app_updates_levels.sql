-- =============================================================================
-- Migration 040: App Updates Rollout Levels
-- Adds update_type ('simple', 'recommended', 'mandatory') and title to app_updates
-- =============================================================================

ALTER TABLE public.app_updates 
  ADD COLUMN IF NOT EXISTS update_type text NOT NULL DEFAULT 'recommended' 
  CHECK (update_type IN ('simple', 'recommended', 'mandatory')),
  ADD COLUMN IF NOT EXISTS title text DEFAULT 'Update Available';

-- Update or insert current release metadata (v1.1.2, build 10)
INSERT INTO public.app_updates (
  id,
  latest_version,
  latest_version_code,
  min_supported_version_code,
  update_type,
  title,
  release_notes,
  play_store_url,
  is_active
) VALUES (
  'latest',
  '1.1.2',
  10,
  9,
  'recommended',
  'Update Available 🚀',
  'Personal food tagging with @, 0ms fast-path macro scans, and performance refinements.',
  'https://play.google.com/store/apps/details?id=com.nudgeforward.dayfuel',
  true
) ON CONFLICT (id) DO UPDATE SET
  latest_version = EXCLUDED.latest_version,
  latest_version_code = EXCLUDED.latest_version_code,
  min_supported_version_code = EXCLUDED.min_supported_version_code,
  update_type = EXCLUDED.update_type,
  title = EXCLUDED.title,
  release_notes = EXCLUDED.release_notes,
  play_store_url = EXCLUDED.play_store_url,
  is_active = EXCLUDED.is_active,
  updated_at = now();
