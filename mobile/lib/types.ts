// Shared TypeScript types for Macro Tracker
// =============================================================================

import { ExerciseSource, CalculationMethod } from './constants';

/** User profile and goals from the profiles table */
export interface Profile {
  id: string;
  full_name?: string;
  display_name: string | null;
  avatar_id?: string | null;
  height_cm: number | null;
  gender: string | null;
  date_of_birth: string | null;
  activity_level: string | null;
  weight_kg: number | null;
  target_weight_kg: number | null;
  starting_weight_kg?: number | null;
  age: number | null;
  goal: string | null;
  target_calories: number | null;
  maintenance_calories: number | null;
  under_eating_threshold: number | null;
  target_protein: number | null;
  target_carbs: number | null;
  target_fat: number | null;
  target_steps: number | null;
  activity_credit_factor?: number | null;
  stride_length_cm?: number | null;
  last_check_in_date?: string | null;
  trend_weight_kg?: number | null;
  protein_multiplier?: number | null;
  calibrated_weight_kg?: number | null;
  created_at?: string;
}

/** A single food item with nutritional breakdown */
export interface FoodItem {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/** Aggregated totals for a meal */
export interface MealTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/** The response from the scan-food edge function (Gemini estimate) */
export interface MealEstimate {
  title?: string;
  meal_name: string;
  foods: FoodItem[];
  totals: MealTotals;
  confidence: number;
}

/** A food entry row from the meal_entries table */
export interface MealEntry {
  id: string;
  user_id: string;
  meal_type: string;
  meal_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  image_path: string | null;
  title?: string | null;
  summary_date?: string | null;
  raw_input?: { foods?: FoodItem[] } | null;
  created_at: string;
  meal_food?: MealFood[];
}

/** A food item row from the meal_food table */
export interface MealFood {
  id: string;
  meal_id: string;
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/** A recent food row from the recent_foods table */
export interface RecentFood {
  id: string;
  user_id: string;
  meal_name: string;
  foods: FoodItem[];
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  used_count: number;
  last_used_at: string;
  created_at: string;
}

/** An exercise logged by the user */
export interface ExerciseEntry {
  id: string;
  user_id: string;
  exercise_date: string;
  exercise_type: string;
  description: string | null;
  duration_minutes: number;
  steps_count?: number;
  calories_burned: number;
  title?: string | null;
  activity_code?: string | null;
  created_at: string;
  source?: ExerciseSource | string | null;
  calculation_method?: CalculationMethod | string | null;
  external_id?: string | null;
}

/** A user's logged weight entry */
export interface WeightLog {
  id: string;
  user_id: string;
  weight: number;
  body_fat_percentage?: number | null;
  muscle_mass?: number | null;
  recorded_at: string;
  log_date?: string;
}

/** Tier 1 Activity Group (Base concept embedded with vector) */
export interface ActivityGroup {
  code: string;
  name: string;
  category: string;
  default_met: number;
  search_keywords?: string[];
  variant_count?: number;
}

/** Tier 2 Activity Variant from Compendium (pacing, intensity, MET) */
export interface ActivityVariant {
  code: string;
  group_code: string;
  name: string;
  met: number;
  category: string;
  intensity_level: 'light' | 'moderate' | 'vigorous';
}

/** Candidate returned from semantic search */
export interface ExerciseSemanticCandidate {
  code: string;
  name: string;
  category: string;
  default_met: number;
  similarity: number;
}

/** Response from log-exercise semantic analysis */
export interface ExerciseSemanticResponse {
  status: 'exact_match' | 'multiple_candidates' | 'unmatched';
  activity?: ExerciseSemanticCandidate;
  candidates?: ExerciseSemanticCandidate[];
  duration_minutes?: number | null;
  detected_intensity?: 'light' | 'moderate' | 'vigorous' | null;
}

/** Adaptive nutrition coaching action type */
export type CheckInActionType =
  | 'hold'
  | 'decrease'
  | 'proactive_trim'
  | 'increase'
  | 'floor_reached'
  | 'adherence_warning';

/** Status of the weekly check in decision */
export type CheckInStatus = 'accepted' | 'kept_current' | 'skipped';

/** Result from evaluateWeeklyCheckIn */
export interface CheckInRecommendation {
  actionType: CheckInActionType;
  title: string;
  verdict: string;
  rationale: string;
  detailedGuidance?: string;
  isFirstCheckIn: boolean;
  daysLogged: number; // Out of 7
  adherenceMet: boolean;
  currentScaleWeight: number;
  currentTrendWeight: number;
  previousTrendWeight: number;
  weightDeltaKg: number;
  ratePercent: number; // e.g. -0.52 for -0.52% BW change
  // Nutrition comparisons
  oldCalories: number;
  newCalories: number;
  calorieDelta: number;
  oldMaintenance: number;
  newMaintenance: number;
  oldProtein: number;
  newProtein: number;
  oldCarbs: number;
  newCarbs: number;
  oldFat: number;
  newFat: number;
  proteinMultiplier: number;
  calibratedWeightKg: number;
  targetSteps: number;
  // Safety floor
  safetyFloor: number;
  isAtFloor: number | boolean;
}

/** Check-in record stored in Supabase check_ins table */
export interface CheckInRecord {
  id: string;
  user_id: string;
  check_in_date: string;
  scale_weight: number;
  trend_weight: number;
  previous_trend_weight?: number | null;
  weight_delta_kg?: number | null;
  rate_percent?: number | null;
  days_logged: number;
  average_calories?: number | null;
  status: CheckInStatus;
  action_type: CheckInActionType;
  old_calories?: number | null;
  new_calories?: number | null;
  old_protein?: number | null;
  new_protein?: number | null;
  old_carbs?: number | null;
  new_carbs?: number | null;
  old_fat?: number | null;
  new_fat?: number | null;
  coach_message: string;
  created_at: string;
}

/** App update metadata stored in Supabase app_updates table */
export interface AppUpdateInfo {
  id: string;
  latest_version: string;
  latest_version_code: number;
  min_supported_version_code?: number | null;
  release_notes?: string | null;
  play_store_url: string;
  is_active: boolean;
  updated_at: string;
}
