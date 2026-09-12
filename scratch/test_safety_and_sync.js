const {
  getCalorieSafetyFloor,
  evaluateWeeklyCheckIn,
  getCalorieZoneColor,
} = require('../mobile/lib/nutrition');

console.log('=== 1. Testing getCalorieSafetyFloor (BMR, 1200 Female / 1500 Male, TDEE - 500) ===');
// Female: TDEE 1800, BMR 1250 -> max(1200, 1250, 1800 - 500 = 1300) = 1300
const f1 = getCalorieSafetyFloor('Female', 1800, 1250);
console.log('Female TDEE 1800, BMR 1250 (expected 1300):', f1, f1 === 1300 ? 'PASS' : 'FAIL');

// Female: TDEE 1600, BMR 1250 -> max(1200, 1250, 1600 - 500 = 1100) = 1250 (protected by BMR!)
const f2 = getCalorieSafetyFloor('Female', 1600, 1250);
console.log('Female TDEE 1600, BMR 1250 (expected 1250):', f2, f2 === 1250 ? 'PASS' : 'FAIL');

// Male: TDEE 1900, BMR 1400 -> max(1500, 1400, 1900 - 500 = 1400) = 1500 (protected by 1500 male base floor!)
const m1 = getCalorieSafetyFloor('Male', 1900, 1400);
console.log('Male TDEE 1900, BMR 1400 (expected 1500):', m1, m1 === 1500 ? 'PASS' : 'FAIL');

// Male: TDEE 2400, BMR 1670 -> max(1500, 1670, 2400 - 500 = 1900) = 1900
const m2 = getCalorieSafetyFloor('Male', 2400, 1670);
console.log('Male TDEE 2400, BMR 1670 (expected 1900):', m2, m2 === 1900 ? 'PASS' : 'FAIL');

console.log('\n=== 2. Testing getCalorieZoneColor 4 Discrete Zones ===');
// TDEE = 2000, Floor = 1500
// Red: < 1500
// Green: 1500 - 2399 (since TDEE + 400 = 2400)
// Normal Purple: 2400 - 2500 (TDEE + 400 to TDEE + 500)
// Intense Purple: > 2500 (TDEE + 500)
const tdee = 2000;
const floor = 1500;
const testCases = [
  { cal: 0, expZone: 'undereating', expColor: '#EF4444' },
  { cal: 1400, expZone: 'undereating', expColor: '#EF4444' },
  { cal: 1499, expZone: 'undereating', expColor: '#EF4444' },
  { cal: 1500, expZone: 'target', expColor: '#10B981' },
  { cal: 1800, expZone: 'target', expColor: '#10B981' },
  { cal: 2000, expZone: 'target', expColor: '#10B981' },
  { cal: 2399, expZone: 'target', expColor: '#10B981' },
  { cal: 2400, expZone: 'caution', expColor: '#A855F7' },
  { cal: 2450, expZone: 'caution', expColor: '#A855F7' },
  { cal: 2500, expZone: 'caution', expColor: '#A855F7' },
  { cal: 2501, expZone: 'alert', expColor: '#9333EA' },
  { cal: 3000, expZone: 'alert', expColor: '#9333EA' },
];

let allZonesPass = true;
testCases.forEach(tc => {
  const res = getCalorieZoneColor(tc.cal, 1800, tdee, 'Lose weight', floor, 'Male', 1500);
  const pass = res.zone === tc.expZone && res.color === tc.expColor;
  if (!pass) allZonesPass = false;
  console.log(`${tc.cal} kcal -> ${res.zone} (${res.color}) [${pass ? 'PASS' : 'FAIL'}]`);
});

console.log('\n=== 3. Testing DailySummaryCard Icon & Ring Color 100% Lockstep Sync ===');
let syncPass = true;
for (let c = 0; c <= 3500; c += 25) {
  const zoneResult = getCalorieZoneColor(c, 1800, tdee, 'Lose weight', floor, 'Male', 1500);
  
  const isUnderEating = c > 0 && zoneResult.zone === 'undereating';
  const isOverEatingCaution = zoneResult.zone === 'caution';
  const isOverEatingAlert = zoneResult.zone === 'alert';
  const ringColor = c > 0 ? zoneResult.color : '#10B981';

  // Check sync invariants:
  // 1. When isUnderEating is true, ringColor must be #EF4444 (Red)
  if (isUnderEating && ringColor !== '#EF4444') {
    syncPass = false;
    console.error(`Mismatch at ${c} kcal: isUnderEating true but ringColor ${ringColor}`);
  }
  // 2. When isOverEatingCaution is true, ringColor must be #A855F7 (Normal Purple)
  if (isOverEatingCaution && ringColor !== '#A855F7') {
    syncPass = false;
    console.error(`Mismatch at ${c} kcal: isOverEatingCaution true but ringColor ${ringColor}`);
  }
  // 3. When isOverEatingAlert is true, ringColor must be #9333EA (Intense Purple)
  if (isOverEatingAlert && ringColor !== '#9333EA') {
    syncPass = false;
    console.error(`Mismatch at ${c} kcal: isOverEatingAlert true but ringColor ${ringColor}`);
  }
  // 4. When no alert/caution/undereating, ringColor must be #10B981 (Green)
  if (!isUnderEating && !isOverEatingCaution && !isOverEatingAlert && ringColor !== '#10B981') {
    syncPass = false;
    console.error(`Mismatch at ${c} kcal: on target but ringColor ${ringColor}`);
  }
}

console.log('DailySummaryCard Invariant Check across 0 - 3500 kcal:', syncPass ? '100% PASS' : 'FAIL');
