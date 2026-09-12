const {
  getCalorieSafetyFloor,
  evaluateWeeklyCheckIn,
  getCalorieZoneColor,
} = require('../mobile/lib/nutrition');

console.log('--- 1. Testing getCalorieSafetyFloor (BMR, 1200 Female / 1500 Male, TDEE - 450) ---');
// Female: TDEE 1800, BMR 1250 -> max(1200, 1250, 1800 - 450 = 1350) = 1350
console.log('Female TDEE 1800, BMR 1250:', getCalorieSafetyFloor('Female', 1800, 1250)); // 1350
// Female: TDEE 1600, BMR 1250 -> max(1200, 1250, 1600 - 450 = 1150) = 1250 (protected by BMR!)
console.log('Female TDEE 1600, BMR 1250:', getCalorieSafetyFloor('Female', 1600, 1250)); // 1250
// Male: TDEE 1900, BMR 1400 -> max(1500, 1400, 1900 - 450 = 1450) = 1500 (protected by 1500 floor!)
console.log('Male TDEE 1900, BMR 1400:', getCalorieSafetyFloor('Male', 1900, 1400)); // 1500
// Male: TDEE 2400, BMR 1670 -> max(1500, 1670, 2400 - 450 = 1950) = 1950
console.log('Male TDEE 2400, BMR 1670:', getCalorieSafetyFloor('Male', 2400, 1670)); // 1950

console.log('\n--- 2. Testing evaluateWeeklyCheckIn ---');
const baseProfile = {
  id: 'test-user',
  weight_kg: 70,
  starting_weight_kg: 70.5,
  height_cm: 175,
  gender: 'Male',
  age: 26,
  goal: 'Lose weight',
  target_calories: 1950,
  maintenance_calories: 2400,
  target_protein: 150,
  target_carbs: 200,
  target_fat: 65,
  target_steps: 8000,
  last_check_in_date: '2026-09-01',
  trend_weight_kg: 70.0,
};

const stallRes = evaluateWeeklyCheckIn({
  profile: baseProfile,
  weightLogs: [{ weight: 70.0, log_date: '2026-09-08' }],
  dailySummaries: [
    { summary_date: '2026-09-02', total_calories: 1950 },
    { summary_date: '2026-09-03', total_calories: 1950 },
    { summary_date: '2026-09-04', total_calories: 1950 },
    { summary_date: '2026-09-05', total_calories: 1950 },
    { summary_date: '2026-09-06', total_calories: 1950 },
  ],
});

console.log('Stall Check-In Result:', {
  actionType: stallRes.actionType,
  oldCalories: stallRes.oldCalories,
  newCalories: stallRes.newCalories,
  calorieDelta: stallRes.calorieDelta,
  oldMaintenance: stallRes.oldMaintenance,
  newMaintenance: stallRes.newMaintenance,
  safetyFloor: stallRes.safetyFloor,
});

console.log('\n--- 3. Testing getCalorieZoneColor Synchronization ---');
// Male Cutting: Target 1950, TDEE 2400, BMR 1670
// Floor: max(1670, 1500, 2400 - 450) = 1950 kcal
// Undereating (< 1950) -> Red (#EF4444)
// On Target (1950 - 2799) -> Green (#10B981)
// Caution (2800 - 2899) -> Normal Purple (#A855F7)
// Alert (>= 2900) -> Intense Purple (#9333EA)
console.log('=== Cutting: Target 1950, TDEE 2400, Floor 1950 ===');
[1400, 1850, 1949, 1950, 2200, 2400, 2799, 2800, 2850, 2900, 3050].forEach(cal => {
  console.log(cal + ' kcal:', getCalorieZoneColor(cal, 1950, 2400, 'Lose weight', 1950, 'Male', 1670));
});

console.log('\nAll tests executed successfully!');
