import { Profile, CheckInRecommendation, CheckInActionType } from './types';

export type GoalType = 'Lose weight' | 'Maintain weight' | 'Gain muscle' | 'Gain Muscle' | 'Just track my food' | 'Gain weight';

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
/**
 * Formats a bodyweight value to preserve exact decimals without unnecessary rounding.
 * e.g. 58 -> '58', 58.1 -> '58.1', 58.35 -> '58.35', 58.45 -> '58.45'
 */
export function formatWeight(w: number | null | undefined): string {
  if (w === null || w === undefined || isNaN(w)) return '--';
  const rounded2 = Math.round((w + Number.EPSILON) * 100) / 100;
  if (Number.isInteger(rounded2)) return rounded2.toString();
  const rounded1 = Math.round((w + Number.EPSILON) * 10) / 10;
  if (rounded1 === rounded2) return rounded1.toFixed(1);
  return rounded2.toFixed(2);
}

const roundWeightNumber = (w: number): number => Math.round((w + Number.EPSILON) * 100) / 100;

export function getProteinBaselineInfo(
  currentWeight: number,
  targetWeight?: number | null,
  goal?: GoalType | null
): ProteinBaselineInfo {
  // If target weight is not set or goal is bulking/maintaining without weight reduction
  if (!targetWeight || isNaN(targetWeight) || goal === 'Gain muscle' || goal === 'Gain Muscle' || goal === 'Gain weight' || goal === 'Maintain weight' || goal === 'Just track my food') {
    return {
      baseline: currentWeight,
      displayBaseline: roundWeightNumber(currentWeight),
      alpha: 0,
      distance: 0,
      description: `Current weight (${formatWeight(currentWeight)} kg)`,
    };
  }

  const distance = currentWeight - targetWeight;

  // If target weight is higher than or equal to current weight, or within 2 kg
  if (distance <= 2) {
    return {
      baseline: currentWeight,
      displayBaseline: roundWeightNumber(currentWeight),
      alpha: 0,
      distance: Math.max(0, distance),
      description: `Current weight (${formatWeight(currentWeight)} kg)`,
    };
  }

  // If distance >= 10 kg
  if (distance >= 10) {
    return {
      baseline: targetWeight,
      displayBaseline: roundWeightNumber(targetWeight),
      alpha: 1,
      distance,
      description: `Target weight (${formatWeight(targetWeight)} kg)`,
    };
  }

  // Linear interpolation between 2 kg and 10 kg
  const alpha = (distance - 2) / 8;
  const baseline = (1 - alpha) * currentWeight + alpha * targetWeight;
  const displayBaseline = roundWeightNumber(baseline);

  return {
    baseline,
    displayBaseline,
    alpha,
    distance,
    description: `Blended baseline (${formatWeight(displayBaseline)} kg)`,
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
  if (goal === 'Gain muscle' || goal === 'Gain Muscle' || goal === 'Gain weight') {
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
  } else if (goal === 'Gain muscle' || goal === 'Gain Muscle' || goal === 'Gain weight') {
    calTarget += 300;
  }

  // 4. Protein calculation with Dynamic Weight Baseline (4 cal / g)
  const baselineInfo = getProteinBaselineInfo(weightKg, targetWeightKg, goal);
  const multiplier = proteinMultiplier ?? getDefaultProteinMultiplier(goal);
  const pTarget = Math.round(multiplier * baselineInfo.baseline);
  const pCals = pTarget * 4;

  // 5. Remaining calories split: healthy fat range (20% to 30% of total daily calories, targeting 45% of non-protein calories)
  // Fat is 8 cal/g, Carbs is 4 cal/g
  const remainingCals = Math.max(0, calTarget - pCals);
  const rawFatCals = remainingCals * 0.45;
  const maxFatCals = calTarget * 0.30;
  const minFatCals = calTarget * 0.20;
  const fatCals = Math.max(minFatCals, Math.min(rawFatCals, maxFatCals));
  const fTarget = Math.round(fatCals / 8);
  const actualFatCals = fTarget * 8;

  // 6. Carbs receives the remaining calories (4 cal/g)
  const carbCals = Math.max(0, calTarget - pCals - actualFatCals);
  const cTarget = Math.round(carbCals / 4);

  // 7. Exact calorie alignment: calories = (4 * protein) + (4 * carbs) + (8 * fat)
  const finalCalories = (pTarget * 4) + (cTarget * 4) + (fTarget * 8);

  // Steps
  const steps = 5000;

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    targetCalories: finalCalories,
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
 * Calculates Trend Weight using Exponential Moving Average (EMA).
 * Filters transient spikes caused by sodium, water retention, and digestion.
 * alpha = 0.15 (15% new weight, 85% previous trend)
 */
export function calculateTrendWeight(
  logs: { weight: number; log_date: string }[],
  alpha = 0.15
): number {
  if (!logs || logs.length === 0) return 0;
  
  // Sort chronologically ascending
  const sorted = [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date));
  let trend = sorted[0].weight;

  for (let i = 1; i < sorted.length; i++) {
    trend = alpha * sorted[i].weight + (1 - alpha) * trend;
  }

  return Math.round((trend + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates the hard physiological calorie safety floor.
 * Male: max(BMR * 0.9, 1500 kcal)
 * Female / Other: max(BMR * 0.9, 1200 kcal)
 */
export function getCalorieSafetyFloor(
  gender: string | null | undefined,
  bmr: number
): number {
  const baseFloor = gender === 'Male' ? 1500 : 1200;
  return Math.round(Math.max(bmr * 0.90, baseFloor));
}

export interface CheckInEvaluationParams {
  profile: Profile;
  weightLogs: { weight: number; log_date: string }[];
  dailySummaries: { summary_date: string; total_calories: number }[];
}

/**
 * Evaluates weekly nutrition progress and produces an adaptive coaching recommendation.
 * Models proven methodologies from MacroFactor, Carbon Diet Coach, and RP Diet.
 */
export function evaluateWeeklyCheckIn({
  profile,
  weightLogs,
  dailySummaries,
}: CheckInEvaluationParams): CheckInRecommendation {
  const age = profile.age || 28;
  const gender = profile.gender || null;
  const heightCm = profile.height_cm || 170;
  const currentProfileWeight = profile.weight_kg || 70;
  const goal = (profile.goal as GoalType) || 'Lose weight';
  const oldCalories = Math.round(profile.target_calories || 2000);
  const oldProtein = Math.round(profile.target_protein || 150);
  const oldCarbs = Math.round(profile.target_carbs || 200);
  const oldFat = Math.round(profile.target_fat || 65);
  const targetSteps = profile.target_steps || 5000;

  // 1. Calculate Trend Weight and Current Scale Weight
  let currentScaleWeight = currentProfileWeight;
  let currentTrendWeight = currentProfileWeight;

  if (weightLogs && weightLogs.length > 0) {
    const sortedWeights = [...weightLogs].sort((a, b) => a.log_date.localeCompare(b.log_date));
    currentScaleWeight = sortedWeights[sortedWeights.length - 1].weight;
    currentTrendWeight = calculateTrendWeight(sortedWeights, 0.15);
  } else if (profile.trend_weight_kg) {
    currentTrendWeight = profile.trend_weight_kg;
  }

  // 2. Determine Previous Baseline Weight & Check-In History
  const isFirstCheckIn = !profile.last_check_in_date;
  let previousTrendWeight = profile.trend_weight_kg;

  if (!previousTrendWeight) {
    if (profile.starting_weight_kg) {
      previousTrendWeight = profile.starting_weight_kg;
    } else if (weightLogs && weightLogs.length > 0) {
      previousTrendWeight = weightLogs[0].weight;
    } else {
      previousTrendWeight = currentTrendWeight;
    }
  }

  // 3. Weight Delta & Contiguous Rate of Change
  const weightDeltaKg = Math.round((currentTrendWeight - previousTrendWeight) * 100) / 100;
  const ratePercent = previousTrendWeight > 0
    ? Math.round(((currentTrendWeight - previousTrendWeight) / previousTrendWeight) * 10000) / 100
    : 0;

  // 4. Adherence Gating (Requires >= 5 days logged with at least 50% target calories)
  const daysLogged = (dailySummaries || []).filter(
    s => s.total_calories >= 0.5 * oldCalories
  ).length;
  const adherenceMet = daysLogged >= 5;

  // 5. Safety Floor
  let bmr = 10 * currentTrendWeight + 6.25 * heightCm - 5 * age;
  bmr += gender === 'Male' ? 5 : -161;
  const safetyFloor = getCalorieSafetyFloor(gender, bmr);
  const isAtFloor = oldCalories <= safetyFloor;

  // 6. Decision Tree Evaluation
  let actionType: CheckInActionType = 'hold';
  let calorieDelta = 0;
  let title = 'Weekly Check-In Evaluation';
  let verdict = 'On Track';
  let rationale = '';
  let detailedGuidance: string | undefined = undefined;

  if (goal === 'Lose weight') {
    if (ratePercent < -1.0) {
      // Zone 4: Rapid Loss (> -1.0% BW/week)
      actionType = 'increase';
      calorieDelta = 125;
      title = isFirstCheckIn ? 'Initial Check-In: Pacing Adjustment' : 'Pacing Adjustment';
      verdict = 'Losing Weight Faster Than Recommended';
      rationale = `You lost ${Math.abs(weightDeltaKg)} kg (${Math.abs(ratePercent)}% of bodyweight). To protect your lean muscle mass and prevent energy crashes, we've increased your daily calories by +125 kcal.`;
    } else if (ratePercent >= -1.0 && ratePercent < -0.35) {
      // Zone 1: Optimal Loss (-0.35% to -1.0% BW/week)
      actionType = 'hold';
      calorieDelta = 0;
      title = isFirstCheckIn ? 'First Check-In: Optimal Progress' : 'Optimal Fat Loss Pace';
      verdict = 'On Track & Crushing It';
      rationale = `Outstanding progress! Your weight trend dropped by ${Math.abs(weightDeltaKg)} kg (${Math.abs(ratePercent)}%), right in the sustainable sweet spot. We've kept your calorie targets steady to maintain energy while fat continues to drop.`;
    } else if (ratePercent >= -0.35 && ratePercent < -0.10) {
      // Zone 2: Slowing Loss (-0.10% to -0.35% BW/week) - Proactive Trim
      actionType = 'proactive_trim';
      calorieDelta = -75;
      title = 'Proactive Velocity Trim';
      verdict = 'Weight Loss Pace Tapering';
      rationale = `Your weight loss momentum has begun to slow (${Math.abs(weightDeltaKg)} kg this week). Rather than waiting for progress to completely stall, we've proactively trimmed -75 kcal to keep you moving at your target rate.`;
    } else {
      // Zone 3: Plateau / Stall (>= -0.10% BW/week or weight gain)
      if (!adherenceMet) {
        actionType = 'adherence_warning';
        calorieDelta = 0;
        title = 'Consistency First';
        verdict = 'Logging Inconsistent';
        rationale = `You logged meals on ${daysLogged} of the last 7 days. Cutting calories now could lead to undue hunger and diet burnout. Let's aim to track all meals on at least 5 days this week before adjusting targets.`;
      } else if (isAtFloor) {
        actionType = 'floor_reached';
        calorieDelta = 0;
        title = 'Safety Guardrail Active';
        verdict = 'Metabolic Floor Reached';
        rationale = `Your weight has stabilized, but your target (${oldCalories} kcal) is already at your metabolic safety floor (${safetyFloor} kcal). Cutting calories further risks muscle loss and metabolic slowdown. Choose one of our 3 recommended metabolic pathways below.`;
        detailedGuidance = 'SAFETY_FLOOR_GUIDANCE';
      } else {
        actionType = 'decrease';
        calorieDelta = -100;
        title = 'Plateau Breaker';
        verdict = 'Progress Stabilized';
        rationale = `Your weight trend has stabilized over the past week (${weightDeltaKg > 0 ? `+${weightDeltaKg}` : `${weightDeltaKg}`} kg). To break through this plateau and keep fat loss moving forward, we've adjusted your targets by -100 kcal.`;
      }
    }
  } else if (goal === 'Gain muscle' || goal === 'Gain Muscle' || goal === 'Gain weight') {
    if (ratePercent > 0.60) {
      // Zone 4: Rapid Gain (> +0.60% BW/week)
      actionType = 'decrease';
      calorieDelta = -100;
      title = 'Surplus Pacing Dial-Back';
      verdict = 'Gaining Faster Than Optimal';
      rationale = `Your scale weight is increasing faster than maximal muscle protein synthesis rates (+${ratePercent}% BW/week). We've dialed back your surplus by -100 kcal to prioritize lean muscle over unwanted body fat.`;
    } else if (ratePercent >= 0.25 && ratePercent <= 0.60) {
      // Zone 1: Optimal Lean Bulk (+0.25% to +0.60% BW/week)
      actionType = 'hold';
      calorieDelta = 0;
      title = isFirstCheckIn ? 'First Check-In: Optimal Lean Bulk' : 'Optimal Muscle Building Pace';
      verdict = 'Hypertrophy On Track';
      rationale = `Perfect pacing! You gained +${weightDeltaKg} kg (+${ratePercent}%), which is the optimal rate for clean muscle hypertrophy without excessive fat accumulation. Surplus maintained!`;
    } else if (ratePercent >= 0.10 && ratePercent < 0.25) {
      // Zone 2: Tapering / Slowing Gain (+0.10% to +0.25% BW/week) - Proactive Boost
      actionType = 'proactive_trim';
      calorieDelta = 75;
      title = 'Proactive Surplus Boost';
      verdict = 'Gain Velocity Tapering';
      rationale = `Your weight gain pace has begun to taper as your spontaneous daily activity adapted to the intake. We've proactively added +75 kcal to sustain your muscle-building momentum before a full stall.`;
    } else {
      // Zone 3: Stalled / Weight Dropping (< +0.10% BW/week)
      if (!adherenceMet) {
        actionType = 'adherence_warning';
        calorieDelta = 0;
        title = 'Consistency First';
        verdict = 'Incomplete Food Tracking';
        rationale = `You logged meals on ${daysLogged} of the last 7 days. Consistency is essential for building muscle. Let's aim to log consistently before increasing food volume further.`;
      } else {
        actionType = 'increase';
        calorieDelta = 150;
        title = 'Surplus Restoration';
        verdict = 'Weight Gain Flatlined';
        rationale = `Your weight gain has flatlined. Your metabolism has adapted to the current calories. We've added +150 kcal to restore your surplus and drive hypertrophy.`;
      }
    }
  } else {
    // Goal: Maintain weight or Just track my food
    if (ratePercent < -0.50) {
      actionType = 'increase';
      calorieDelta = 100;
      title = 'Maintenance Re-balance';
      verdict = 'Weight Drifting Down';
      rationale = `Your weight trend dropped by ${Math.abs(ratePercent)}% this week. We've added +100 kcal to maintain your current bodyweight.`;
    } else if (ratePercent > 0.50) {
      actionType = 'decrease';
      calorieDelta = -100;
      title = 'Maintenance Re-balance';
      verdict = 'Weight Drifting Up';
      rationale = `Your weight trend increased by +${ratePercent}% this week. We've trimmed -100 kcal to keep you locked at your target baseline.`;
    } else {
      actionType = 'hold';
      calorieDelta = 0;
      title = 'Steady Maintenance';
      verdict = 'Weight Rock-Solid';
      rationale = `Your body weight is holding steady within your maintenance window. Targets kept unchanged!`;
    }
  }

  // 7. Calculate New Calorie and Macro Targets
  let newCalories = oldCalories;
  let newProtein = oldProtein;
  let newCarbs = oldCarbs;
  let newFat = oldFat;
  
  // Determine protein multiplier (respecting saved multiplier on profile if available)
  let proteinMultiplier = profile.protein_multiplier ?? getDefaultProteinMultiplier(goal);
  if (!profile.protein_multiplier && profile.target_protein && profile.weight_kg && profile.weight_kg > 0) {
    const oldBaseline = getProteinBaselineInfo(profile.weight_kg, profile.target_weight_kg, goal).baseline;
    if (oldBaseline > 0) {
      const derived = profile.target_protein / oldBaseline;
      if (derived >= 1.55 && derived <= 2.25) {
        proteinMultiplier = Math.round(derived * 10) / 10;
      }
    }
  }

  const baselineInfo = getProteinBaselineInfo(currentScaleWeight, profile.target_weight_kg, goal);
  let calibratedWeightKg = profile.calibrated_weight_kg || roundWeightNumber(baselineInfo.baseline);

  // When updating (adding or reducing calories in the check-in review process):
  // Equation: calories = (4 * protein) + (4 * carbs) + (8 * fat)
  if (calorieDelta !== 0) {
    const rawNewCalories = Math.max(safetyFloor, oldCalories + calorieDelta);

    // Priority 1: Protein set first based on current calibrated weight baseline & multiplier (4 cal/g)
    newProtein = Math.round(proteinMultiplier * baselineInfo.baseline);
    const proteinCals = newProtein * 4;

    // Priority 2: Healthy fat range (20% to 30% of total calories, targeting 45% of non-protein calories at 8 cal/g)
    const remainingCals = Math.max(0, rawNewCalories - proteinCals);
    const rawFatCals = remainingCals * 0.45;
    const maxFatCals = rawNewCalories * 0.30;
    const minFatCals = rawNewCalories * 0.20;
    const fatCals = Math.max(minFatCals, Math.min(rawFatCals, maxFatCals));
    newFat = Math.round(fatCals / 8);
    const actualFatCals = newFat * 8;

    // Priority 3: Carbs receives the remaining calories (4 cal/g)
    const carbCals = Math.max(0, rawNewCalories - proteinCals - actualFatCals);
    newCarbs = Math.round(carbCals / 4);

    // Exact calorie alignment: calories = (4 * protein) + (4 * carbs) + (8 * fat)
    newCalories = (newProtein * 4) + (newCarbs * 4) + (newFat * 8);
    calibratedWeightKg = roundWeightNumber(baselineInfo.baseline);
  }

  return {
    actionType,
    title,
    verdict,
    rationale,
    detailedGuidance,
    isFirstCheckIn,
    daysLogged,
    adherenceMet,
    currentScaleWeight: roundWeightNumber(currentScaleWeight),
    currentTrendWeight: roundWeightNumber(currentTrendWeight),
    previousTrendWeight: roundWeightNumber(previousTrendWeight),
    weightDeltaKg,
    ratePercent,
    oldCalories,
    newCalories,
    calorieDelta: newCalories - oldCalories,
    oldProtein,
    newProtein,
    oldCarbs,
    newCarbs,
    oldFat,
    newFat,
    proteinMultiplier,
    calibratedWeightKg: roundWeightNumber(calibratedWeightKg),
    targetSteps,
    safetyFloor,
    isAtFloor,
  };
}

