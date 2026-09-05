export type GoalType = 'Lose weight' | 'Maintain weight' | 'Gain Muscle' | 'Just track my food' | 'Gain weight';

export interface ProteinBaselineInfo {
  baseline: number;
  displayBaseline: number;
  alpha: number;
  distance: number;
  description: string;
}

/**
 * Calculates the blended weight baseline for protein calculation using linear interpolation.
 * 
 * Step 1: distance = currentWeight - targetWeight
 * Step 2: Transition zone is between 2 kg and 10 kg above target weight.
 *         if distance <= 2 -> alpha = 0 (100% current weight)
 *         else if distance >= 10 -> alpha = 1 (100% target weight)
 *         else -> alpha = (distance - 2) / 8
 * Step 3: calculatedWeightBaseline = (1 - alpha) * currentWeight + alpha * targetWeight
 * 
 * @param currentWeight Current body weight in kg
 * @param targetWeight Target body weight in kg
 * @param goal User's goal
 */
export function getProteinBaselineInfo(
  currentWeight: number,
  targetWeight?: number | null,
  goal?: GoalType | null
): ProteinBaselineInfo {
  // If target weight is not set or goal is bulking/maintaining without weight reduction
  if (!targetWeight || isNaN(targetWeight) || goal === 'Gain Muscle' || goal === 'Gain weight' || goal === 'Maintain weight' || goal === 'Just track my food') {
    return {
      baseline: currentWeight,
      displayBaseline: Math.round(currentWeight * 10) / 10,
      alpha: 0,
      distance: 0,
      description: `Current weight (${Math.round(currentWeight * 10) / 10} kg)`,
    };
  }

  const distance = currentWeight - targetWeight;

  // If target weight is higher than or equal to current weight, or within 2 kg
  if (distance <= 2) {
    return {
      baseline: currentWeight,
      displayBaseline: Math.round(currentWeight * 10) / 10,
      alpha: 0,
      distance: Math.max(0, distance),
      description: `Current weight (${Math.round(currentWeight * 10) / 10} kg)`,
    };
  }

  // If distance >= 10 kg
  if (distance >= 10) {
    return {
      baseline: targetWeight,
      displayBaseline: Math.round(targetWeight * 10) / 10,
      alpha: 1,
      distance,
      description: `Target weight (${Math.round(targetWeight * 10) / 10} kg)`,
    };
  }

  // Linear interpolation between 2 kg and 10 kg
  const alpha = (distance - 2) / 8;
  const baseline = (1 - alpha) * currentWeight + alpha * targetWeight;
  const displayBaseline = Math.round(baseline * 10) / 10;

  return {
    baseline,
    displayBaseline,
    alpha,
    distance,
    description: `Blended baseline (${displayBaseline} kg)`,
  };
}

export function calculateProteinWeightBaseline(
  currentWeight: number,
  targetWeight?: number | null,
  goal?: GoalType | null
): number {
  return getProteinBaselineInfo(currentWeight, targetWeight, goal).baseline;
}

/**
 * Returns the recommended protein multiplier (in g per kg baseline weight)
 * Bulking: 1.6 g/kg
 * Cutting / Overweight / Maintain / Tracking: 2.0 g/kg
 */
export function getDefaultProteinMultiplier(goal: GoalType | null): number {
  if (goal === 'Gain Muscle' || goal === 'Gain weight') {
    return 1.6;
  }
  return 2.0;
}

export interface TargetCalculationParams {
  age: number;
  gender: 'Male' | 'Female' | null;
  heightCm: number;
  weightKg: number;
  goal: GoalType | null;
  targetWeightKg?: number | null;
  proteinMultiplier?: number;
}

export interface TargetCalculationResult {
  bmr: number;
  tdee: number;
  targetCalories: number;
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
  targetSteps: number;
  weightBaseline: number;
  displayWeightBaseline: number;
  baselineInfo: ProteinBaselineInfo;
  proteinMultiplier: number;
}

/**
 * Calculates BMR, TDEE, calories, and macros based on user profile and goals.
 * Energy constants:
 * - 4 cal / g of protein
 * - 4 cal / g of carbs
 * - 8 cal / g of fat
 * 
 * Non-protein calories are split: 55% Carbs / 45% Fat, with Fat capped at 30% of total daily calories.
 * Any excess fat calories beyond 30% are shifted directly to Carbs.
 */
export function calculateNutritionTargets({
  age,
  gender,
  heightCm,
  weightKg,
  goal,
  targetWeightKg,
  proteinMultiplier,
}: TargetCalculationParams): TargetCalculationResult {
  // 1. Mifflin-St Jeor BMR
  let bmr = 10 * weightKg + 6.25 * heightCm - 5 * age;
  bmr += gender === 'Male' ? 5 : -161;

  // 2. TDEE with PAL = 1.2 (Sedentary baseline)
  const pal = 1.2;
  const tdee = bmr * pal;

  // 3. Goal calorie adjustment
  let calTarget = tdee;
  if (goal === 'Lose weight') {
    calTarget -= 450;
    calTarget = Math.max(calTarget, bmr);
  } else if (goal === 'Gain Muscle' || goal === 'Gain weight') {
    calTarget += 300;
  }

  // 4. Protein calculation with Dynamic Weight Baseline (4 cal / g)
  const baselineInfo = getProteinBaselineInfo(weightKg, targetWeightKg, goal);
  const multiplier = proteinMultiplier ?? getDefaultProteinMultiplier(goal);
  const pTarget = Math.round(multiplier * baselineInfo.baseline);
  const pCals = pTarget * 4;

  // 5. Remaining calories split: 55% Carbs / 45% Fat, capped at 30% of total daily calories
  // Fat is 8 cal/g, Carbs is 4 cal/g
  const remainingCals = Math.max(0, calTarget - pCals);
  const rawFatCals = remainingCals * 0.45;
  const maxFatCals = calTarget * 0.30;
  const fatCals = Math.min(rawFatCals, maxFatCals);
  const carbCals = Math.max(0, remainingCals - fatCals);

  const fTarget = Math.round(fatCals / 8);
  const cTarget = Math.round(carbCals / 4);

  // 6. Steps
  const steps = 5000;

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    targetCalories: Math.round(calTarget),
    targetProtein: pTarget,
    targetCarbs: cTarget,
    targetFat: fTarget,
    targetSteps: steps,
    weightBaseline: baselineInfo.baseline,
    displayWeightBaseline: baselineInfo.displayBaseline,
    baselineInfo,
    proteinMultiplier: multiplier,
  };
}

/**
 * Formats a bodyweight value to preserve exact decimals without unnecessary rounding.
 * e.g. 58 -> '58', 58.1 -> '58.1', 58.35 -> '58.35'
 */
export function formatWeight(w: number | null | undefined): string {
  if (w === null || w === undefined || isNaN(w)) return '--';
  const rounded2 = Math.round((w + Number.EPSILON) * 100) / 100;
  if (Number.isInteger(rounded2)) return rounded2.toString();
  const rounded1 = Math.round((w + Number.EPSILON) * 10) / 10;
  if (rounded1 === rounded2) return rounded1.toFixed(1);
  return rounded2.toFixed(2);
}
