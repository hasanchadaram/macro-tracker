-- =============================================================================
-- Migration 035: App Updates Table
-- Stores the latest published app version and release details for update checking
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.app_updates (
  id text PRIMARY KEY DEFAULT 'latest',
  latest_version text NOT NULL DEFAULT '1.1.1',
  latest_version_code integer NOT NULL DEFAULT 9,
  min_supported_version_code integer DEFAULT 8,
  release_notes text DEFAULT 'Performance optimizations, safety floor alignment, and bug fixes.',
  play_store_url text NOT NULL DEFAULT 'https://play.google.com/store/apps/details?id=com.nudgeforward.dayfuel',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_updates ENABLE ROW LEVEL SECURITY;

-- Allow read access for everyone (authenticated and anonymous)
GRANT SELECT ON public.app_updates TO authenticated, anon;

DROP POLICY IF EXISTS "Allow read access to app updates for everyone" ON public.app_updates;
CREATE POLICY "Allow read access to app updates for everyone"
  ON public.app_updates
  FOR SELECT
  USING (true);

-- Seed initial version row
INSERT INTO public.app_updates (
  id,
  latest_version,
  latest_version_code,
  min_supported_version_code,
  release_notes,
  play_store_url,
  is_active
) VALUES (
  'latest',
  '1.1.1',
  9,
  8,
  'Performance optimizations, safety floor alignment, and bug fixes.',
  'https://play.google.com/store/apps/details?id=com.nudgeforward.dayfuel',
  true
) ON CONFLICT (id) DO UPDATE SET
  latest_version = EXCLUDED.latest_version,
  latest_version_code = EXCLUDED.latest_version_code,
  release_notes = EXCLUDED.release_notes,
  play_store_url = EXCLUDED.play_store_url,
  updated_at = now();
