const {
  calculateTrendWeight,
  getCalorieSafetyFloor,
  evaluateWeeklyCheckIn,
} = require('../mobile/lib/nutrition');

console.log('Testing calculateTrendWeight:');
const noisyLogs = [
  { weight: 70.0, log_date: '2026-09-01' },
  { weight: 71.5, log_date: '2026-09-02' }, // water spike
  { weight: 69.8, log_date: '2026-09-03' },
  { weight: 71.2, log_date: '2026-09-04' },
  { weight: 69.7, log_date: '2026-09-05' },
];
const trend = calculateTrendWeight(noisyLogs);
console.log('Trend weight computed:', trend);

console.log('\nTesting getCalorieSafetyFloor:');
console.log('Female BMR 1250:', getCalorieSafetyFloor('Female', 1250)); // max(1125, 1200) = 1200
console.log('Male BMR 1600:', getCalorieSafetyFloor('Male', 1600)); // max(1440, 1500) = 1500
console.log('Male BMR 1800:', getCalorieSafetyFloor('Male', 1800)); // max(1620, 1500) = 1620

console.log('\nTesting evaluateWeeklyCheckIn for First Check-In:');
const profile1 = {
  id: 'test-user',
  weight_kg: 70,
  starting_weight_kg: 70.5,
  height_cm: 175,
  gender: 'Male',
  age: 26,
  goal: 'Lose weight',
  target_calories: 2100,
  target_protein: 150,
  target_carbs: 220,
  target_fat: 65,
  target_steps: 8000,
  last_check_in_date: null,
};
const res1 = evaluateWeeklyCheckIn({
  profile: profile1,
  weightLogs: [{ weight: 69.8, log_date: '2026-09-06' }],
  dailySummaries: [
    { summary_date: '2026-09-01', total_calories: 2050 },
    { summary_date: '2026-09-02', total_calories: 2100 },
    { summary_date: '2026-09-03', total_calories: 1950 },
    { summary_date: '2026-09-04', total_calories: 2000 },
    { summary_date: '2026-09-05', total_calories: 2100 },
  ],
});
console.log('Res 1 (First CheckIn):', {
  actionType: res1.actionType,
  title: res1.title,
  verdict: res1.verdict,
  ratePercent: res1.ratePercent,
  oldCalories: res1.oldCalories,
  newCalories: res1.newCalories,
  isFirstCheckIn: res1.isFirstCheckIn,
});

console.log('\nTesting Slowing Loss (-0.2% BW) -> Proactive Trim:');
const profile2 = {
  ...profile1,
  trend_weight_kg: 70.0,
  last_check_in_date: '2026-08-30',
};
const res2 = evaluateWeeklyCheckIn({
  profile: profile2,
  weightLogs: [{ weight: 69.85, log_date: '2026-09-06' }], // -0.15 kg = -0.21%
  dailySummaries: [
    { summary_date: '2026-09-01', total_calories: 2050 },
    { summary_date: '2026-09-02', total_calories: 2100 },
    { summary_date: '2026-09-03', total_calories: 1950 },
    { summary_date: '2026-09-04', total_calories: 2000 },
    { summary_date: '2026-09-05', total_calories: 2100 },
  ],
});
console.log('Res 2 (Proactive Trim):', {
  actionType: res2.actionType,
  title: res2.title,
  ratePercent: res2.ratePercent,
  oldCalories: res2.oldCalories,
  newCalories: res2.newCalories,
});

console.log('\nTesting Muscle Gain Tapering (+0.18% BW) -> Proactive Surplus Boost:');
const profile3 = {
  ...profile1,
  goal: 'Gain muscle',
  trend_weight_kg: 70.0,
  last_check_in_date: '2026-08-30',
};
const res3 = evaluateWeeklyCheckIn({
  profile: profile3,
  weightLogs: [{ weight: 70.13, log_date: '2026-09-06' }], // +0.13 kg = +0.19%
  dailySummaries: [
    { summary_date: '2026-09-01', total_calories: 2500 },
    { summary_date: '2026-09-02', total_calories: 2500 },
    { summary_date: '2026-09-03', total_calories: 2500 },
    { summary_date: '2026-09-04', total_calories: 2500 },
    { summary_date: '2026-09-05', total_calories: 2500 },
  ],
});
console.log('Res 3 (Bulking Proactive Boost):', {
  actionType: res3.actionType,
  title: res3.title,
  ratePercent: res3.ratePercent,
  oldCalories: res3.oldCalories,
  newCalories: res3.newCalories,
});

console.log('\nTesting Safety Floor Stalled Female:');
const profileFloor = {
  ...profile1,
  gender: 'Female',
  height_cm: 160,
  weight_kg: 55,
  target_calories: 1200,
  trend_weight_kg: 55.0,
  last_check_in_date: '2026-08-30',
};
const resFloor = evaluateWeeklyCheckIn({
  profile: profileFloor,
  weightLogs: [{ weight: 55.0, log_date: '2026-09-06' }], // 0 change
  dailySummaries: [
    { summary_date: '2026-09-01', total_calories: 1200 },
    { summary_date: '2026-09-02', total_calories: 1200 },
    { summary_date: '2026-09-03', total_calories: 1200 },
    { summary_date: '2026-09-04', total_calories: 1200 },
    { summary_date: '2026-09-05', total_calories: 1200 },
  ],
});
console.log('Res Floor:', {
  actionType: resFloor.actionType,
  title: resFloor.title,
  isAtFloor: resFloor.isAtFloor,
  oldCalories: resFloor.oldCalories,
  newCalories: resFloor.newCalories,
  detailedGuidance: !!resFloor.detailedGuidance,
});

console.log('\nTesting Inconsistent Adherence (< 5 days):');
const resAdherence = evaluateWeeklyCheckIn({
  profile: profile2,
  weightLogs: [{ weight: 70.0, log_date: '2026-09-06' }], // stall
  dailySummaries: [
    { summary_date: '2026-09-01', total_calories: 2000 },
    { summary_date: '2026-09-02', total_calories: 2000 },
    { summary_date: '2026-09-03', total_calories: 2000 },
  ], // only 3 days
});
console.log('Res Adherence:', {
  actionType: resAdherence.actionType,
  title: resAdherence.title,
  daysLogged: resAdherence.daysLogged,
  adherenceMet: resAdherence.adherenceMet,
  oldCalories: resAdherence.oldCalories,
  newCalories: resAdherence.newCalories,
});

