-- =============================================================================
-- Migration 037: Global Food Catalog
-- USDA-seeded, admin-curated food database for Day Fuel.
-- Contains simple foods (boiled egg, milk, toor dal, olive oil, etc.)
-- that serve as atomic ingredients for compound user foods.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.global_foods (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  name_aliases  text[] DEFAULT '{}',
  category      text,
  per_100g      jsonb NOT NULL,
  is_verified   boolean NOT NULL DEFAULT false,
  source        text NOT NULL DEFAULT 'admin',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Full-text search index for name lookups
CREATE INDEX IF NOT EXISTS idx_global_foods_fts
  ON public.global_foods USING GIN (to_tsvector('english', name));

-- Category filter index
CREATE INDEX IF NOT EXISTS idx_global_foods_category
  ON public.global_foods (category);

-- RLS: readable by all authenticated users; only service_role can write
ALTER TABLE public.global_foods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "global_foods_select"
  ON public.global_foods
  FOR SELECT
  TO authenticated
  USING (true);

-- =============================================================================
-- Seed a small set of common Indian/global foods for immediate usability.
-- These are simple, single-ingredient foods. Nutrition is per 100g.
-- Source: USDA FoodData Central / standard nutrition references.
-- =============================================================================

INSERT INTO public.global_foods (name, name_aliases, category, per_100g, is_verified, source) VALUES
  -- Eggs & Dairy
  ('Egg (whole, raw)', '{"Anda", "Guddu"}', 'eggs_dairy',
   '{"calories": 143, "protein_g": 12.6, "carbs_g": 0.7, "fat_g": 9.5, "fiber_g": 0, "sodium_mg": 142}',
   true, 'usda'),
  ('Egg (boiled)', '{"Boiled Egg", "Uddina Guddu"}', 'eggs_dairy',
   '{"calories": 155, "protein_g": 12.6, "carbs_g": 1.1, "fat_g": 10.6, "fiber_g": 0, "sodium_mg": 124}',
   true, 'usda'),
  ('Whole Milk', '{"Full Cream Milk", "Paalu"}', 'eggs_dairy',
   '{"calories": 61, "protein_g": 3.2, "carbs_g": 4.8, "fat_g": 3.3, "fiber_g": 0, "sodium_mg": 43}',
   true, 'usda'),
  ('Paneer', '{"Cottage Cheese", "Indian Cheese"}', 'eggs_dairy',
   '{"calories": 265, "protein_g": 18.3, "carbs_g": 1.2, "fat_g": 20.8, "fiber_g": 0, "sodium_mg": 18}',
   true, 'usda'),
  ('Curd (Yogurt)', '{"Dahi", "Perugu"}', 'eggs_dairy',
   '{"calories": 60, "protein_g": 3.1, "carbs_g": 4.7, "fat_g": 3.3, "fiber_g": 0, "sodium_mg": 46}',
   true, 'usda'),

  -- Grains & Staples
  ('White Rice (cooked)', '{"Steamed Rice", "Annam", "Bhat"}', 'grains',
   '{"calories": 130, "protein_g": 2.7, "carbs_g": 28.2, "fat_g": 0.3, "fiber_g": 0.4, "sodium_mg": 1}',
   true, 'usda'),
  ('Brown Rice (cooked)', '{"Brown Rice"}', 'grains',
   '{"calories": 123, "protein_g": 2.7, "carbs_g": 25.6, "fat_g": 1.0, "fiber_g": 1.6, "sodium_mg": 4}',
   true, 'usda'),
  ('Wheat Flour (atta)', '{"Atta", "Godhumai Maavu", "Chapati Flour"}', 'grains',
   '{"calories": 340, "protein_g": 13.2, "carbs_g": 64.0, "fat_g": 2.5, "fiber_g": 10.7, "sodium_mg": 2}',
   true, 'usda'),
  ('Oats (dry)', '{"Rolled Oats", "Oatmeal"}', 'grains',
   '{"calories": 389, "protein_g": 16.9, "carbs_g": 66.3, "fat_g": 6.9, "fiber_g": 10.6, "sodium_mg": 2}',
   true, 'usda'),
  ('Roti / Chapati', '{"Phulka", "Wheat Flatbread"}', 'grains',
   '{"calories": 297, "protein_g": 9.0, "carbs_g": 50.0, "fat_g": 7.5, "fiber_g": 3.5, "sodium_mg": 290}',
   true, 'usda'),

  -- Legumes & Pulses
  ('Toor Dal (dry)', '{"Arhar Dal", "Pigeon Pea", "Kandi Pappu"}', 'legumes',
   '{"calories": 343, "protein_g": 22.3, "carbs_g": 57.6, "fat_g": 1.5, "fiber_g": 15.0, "sodium_mg": 17}',
   true, 'usda'),
  ('Moong Dal (dry)', '{"Green Gram Dal", "Pesalu Pappu"}', 'legumes',
   '{"calories": 347, "protein_g": 24.0, "carbs_g": 59.9, "fat_g": 1.2, "fiber_g": 16.3, "sodium_mg": 6}',
   true, 'usda'),
  ('Chana Dal (dry)', '{"Bengal Gram Dal", "Senaga Pappu"}', 'legumes',
   '{"calories": 360, "protein_g": 20.1, "carbs_g": 58.0, "fat_g": 5.3, "fiber_g": 18.0, "sodium_mg": 25}',
   true, 'usda'),
  ('Chickpeas (cooked)', '{"Chole", "Chana", "Garbanzo"}', 'legumes',
   '{"calories": 164, "protein_g": 8.9, "carbs_g": 27.4, "fat_g": 2.6, "fiber_g": 7.6, "sodium_mg": 7}',
   true, 'usda'),

  -- Vegetables
  ('Spinach (raw)', '{"Palak", "Palakura"}', 'vegetables',
   '{"calories": 23, "protein_g": 2.9, "carbs_g": 3.6, "fat_g": 0.4, "fiber_g": 2.2, "sodium_mg": 79}',
   true, 'usda'),
  ('Tomato', '{"Tamatar", "Tomato"}', 'vegetables',
   '{"calories": 18, "protein_g": 0.9, "carbs_g": 3.9, "fat_g": 0.2, "fiber_g": 1.2, "sodium_mg": 5}',
   true, 'usda'),
  ('Onion', '{"Pyaaz", "Ullipaya"}', 'vegetables',
   '{"calories": 40, "protein_g": 1.1, "carbs_g": 9.3, "fat_g": 0.1, "fiber_g": 1.7, "sodium_mg": 4}',
   true, 'usda'),
  ('Potato (boiled)', '{"Aloo", "Bangaladumpa"}', 'vegetables',
   '{"calories": 87, "protein_g": 1.9, "carbs_g": 20.1, "fat_g": 0.1, "fiber_g": 1.8, "sodium_mg": 5}',
   true, 'usda'),

  -- Oils & Fats
  ('Olive Oil', '{"Extra Virgin Olive Oil"}', 'oils_fats',
   '{"calories": 884, "protein_g": 0, "carbs_g": 0, "fat_g": 100, "fiber_g": 0, "sodium_mg": 2}',
   true, 'usda'),
  ('Mustard Oil', '{"Sarson Ka Tel", "Avala Nune"}', 'oils_fats',
   '{"calories": 884, "protein_g": 0, "carbs_g": 0, "fat_g": 100, "fiber_g": 0, "sodium_mg": 0}',
   true, 'usda'),
  ('Ghee', '{"Clarified Butter", "Neyyi"}', 'oils_fats',
   '{"calories": 900, "protein_g": 0, "carbs_g": 0, "fat_g": 100, "fiber_g": 0, "sodium_mg": 0}',
   true, 'usda'),
  ('Coconut Oil', '{"Kobbari Nune"}', 'oils_fats',
   '{"calories": 862, "protein_g": 0, "carbs_g": 0, "fat_g": 100, "fiber_g": 0, "sodium_mg": 0}',
   true, 'usda'),
  ('Butter', '{"Makkhan"}', 'oils_fats',
   '{"calories": 717, "protein_g": 0.9, "carbs_g": 0.1, "fat_g": 81.1, "fiber_g": 0, "sodium_mg": 714}',
   true, 'usda'),

  -- Fruits
  ('Banana', '{"Kela", "Aratipandu"}', 'fruits',
   '{"calories": 89, "protein_g": 1.1, "carbs_g": 22.8, "fat_g": 0.3, "fiber_g": 2.6, "sodium_mg": 1}',
   true, 'usda'),
  ('Apple', '{"Seb"}', 'fruits',
   '{"calories": 52, "protein_g": 0.3, "carbs_g": 13.8, "fat_g": 0.2, "fiber_g": 2.4, "sodium_mg": 1}',
   true, 'usda'),
  ('Mango', '{"Aam", "Mamidi Pandu"}', 'fruits',
   '{"calories": 60, "protein_g": 0.8, "carbs_g": 15.0, "fat_g": 0.4, "fiber_g": 1.6, "sodium_mg": 1}',
   true, 'usda'),

  -- Protein Sources
  ('Chicken Breast (cooked)', '{"Grilled Chicken", "Chicken Breast"}', 'proteins',
   '{"calories": 165, "protein_g": 31.0, "carbs_g": 0, "fat_g": 3.6, "fiber_g": 0, "sodium_mg": 74}',
   true, 'usda'),
  ('Whey Protein Powder', '{"Protein Supplement"}', 'proteins',
   '{"calories": 400, "protein_g": 80.0, "carbs_g": 10.0, "fat_g": 5.0, "fiber_g": 0, "sodium_mg": 200}',
   true, 'admin'),

  -- Nuts & Seeds
  ('Almonds', '{"Badam"}', 'nuts_seeds',
   '{"calories": 579, "protein_g": 21.2, "carbs_g": 21.6, "fat_g": 49.9, "fiber_g": 12.5, "sodium_mg": 1}',
   true, 'usda'),
  ('Peanuts', '{"Moongphali", "Verusenaga"}', 'nuts_seeds',
   '{"calories": 567, "protein_g": 25.8, "carbs_g": 16.1, "fat_g": 49.2, "fiber_g": 8.5, "sodium_mg": 18}',
   true, 'usda'),

  -- Sweeteners & Condiments
  ('Sugar (white)', '{"Cheeni", "Panchidara"}', 'sweeteners',
   '{"calories": 387, "protein_g": 0, "carbs_g": 100, "fat_g": 0, "fiber_g": 0, "sodium_mg": 1}',
   true, 'usda'),
  ('Honey', '{"Madhu", "Tene"}', 'sweeteners',
   '{"calories": 304, "protein_g": 0.3, "carbs_g": 82.4, "fat_g": 0, "fiber_g": 0, "sodium_mg": 4}',
   true, 'usda'),

  -- Sprouts
  ('Sprouts (mixed)', '{"Moong Sprouts", "Molakalu"}', 'legumes',
   '{"calories": 44, "protein_g": 5.5, "carbs_g": 4.1, "fat_g": 0.5, "fiber_g": 1.8, "sodium_mg": 10}',
   true, 'admin')
ON CONFLICT (name) DO NOTHING;
