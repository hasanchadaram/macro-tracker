-- =============================================================================
-- Migration 038: Personal Food Library (user_foods)
-- Per-user food items with lineage tracking and ingredient composition.
-- Simple foods: per_100g only, ingredients = NULL
-- Compound foods: per_100g + ingredients[] (each pointing to global_foods)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_foods (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Identity
  name                  text NOT NULL,
  emoji                 text,
  notes                 text,

  -- Provenance
  source                text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'photo', 'describe', 'derived')),
  derived_from_global   uuid REFERENCES public.global_foods(id) ON DELETE SET NULL,
  derived_from_user     uuid REFERENCES public.user_foods(id)   ON DELETE SET NULL,

  -- Serving defaults
  default_serving_g     numeric,
  default_serving_label text,

  -- Nutrition per 100g (always stored)
  per_100g              jsonb NOT NULL,

  -- Ingredient-level composition (NULL for simple foods, populated for compound)
  -- Each element: { food_id: uuid, food_table: 'global'|'user', name: text, amount_g: number }
  ingredients           jsonb DEFAULT NULL,

  -- AI provenance
  ai_estimated          boolean NOT NULL DEFAULT false,
  ai_confidence         numeric,

  -- Usage tracking
  use_count             integer NOT NULL DEFAULT 0,
  last_used_at          timestamptz,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_foods_user_id
  ON public.user_foods (user_id);

CREATE INDEX IF NOT EXISTS idx_user_foods_fts
  ON public.user_foods USING GIN (to_tsvector('english', name));

CREATE INDEX IF NOT EXISTS idx_user_foods_last_used
  ON public.user_foods (user_id, last_used_at DESC NULLS LAST);

-- RLS: users can only access their own foods
ALTER TABLE public.user_foods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_foods_own_select"
  ON public.user_foods FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_foods_own_insert"
  ON public.user_foods FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_foods_own_update"
  ON public.user_foods FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_foods_own_delete"
  ON public.user_foods FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
