// Mock react-native and expo-constants for node unit test
require.cache[require.resolve('react-native')] = {
  id: 'react-native',
  filename: 'react-native',
  loaded: true,
  exports: {
    Linking: {
      canOpenURL: async () => true,
      openURL: async () => {},
    },
  },
};

require.cache[require.resolve('expo-constants')] = {
  id: 'expo-constants',
  filename: 'expo-constants',
  loaded: true,
  exports: {
    default: {
      expoConfig: {
        version: '1.1.0',
        android: { versionCode: 8 },
      },
    },
  },
};

const { isUpdateAvailable } = require('../mobile/lib/versionUtils');

console.log('=== Testing isUpdateAvailable ===');

const testCases = [
  // Version Code comparisons (Primary)
  { currentVer: '1.1.0', currentCode: 8, latestVer: '1.1.1', latestCode: 9, expected: true, label: 'Higher build code 9 > 8' },
  { currentVer: '1.1.0', currentCode: 8, latestVer: '1.1.0', latestCode: 8, expected: false, label: 'Equal build code 8 == 8' },
  { currentVer: '1.1.0', currentCode: 9, latestVer: '1.1.0', latestCode: 8, expected: false, label: 'Lower build code 8 < 9' },

  // SemVer fallback (when build code not supplied)
  { currentVer: '1.1.0', currentCode: 0, latestVer: '1.1.1', latestCode: null, expected: true, label: 'Patch update 1.1.1 > 1.1.0' },
  { currentVer: '1.1.0', currentCode: 0, latestVer: '1.2.0', latestCode: null, expected: true, label: 'Minor update 1.2.0 > 1.1.0' },
  { currentVer: '1.1.0', currentCode: 0, latestVer: '2.0.0', latestCode: null, expected: true, label: 'Major update 2.0.0 > 1.1.0' },
  { currentVer: '1.1.0', currentCode: 0, latestVer: '1.1.0', latestCode: null, expected: false, label: 'Identical semver 1.1.0 == 1.1.0' },
  { currentVer: '1.2.0', currentCode: 0, latestVer: '1.1.9', latestCode: null, expected: false, label: 'Older semver 1.1.9 < 1.2.0' },
  { currentVer: '2.0.0', currentCode: 0, latestVer: '1.9.9', latestCode: null, expected: false, label: 'Older major semver 1.9.9 < 2.0.0' },
];

let allPassed = true;
testCases.forEach((tc) => {
  const actual = isUpdateAvailable(tc.currentVer, tc.currentCode, tc.latestVer, tc.latestCode);
  const pass = actual === tc.expected;
  if (!pass) allPassed = false;
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${tc.label}: expected ${tc.expected}, got ${actual}`);
});

console.log('\nResult:', allPassed ? 'ALL TESTS PASSED!' : 'SOME TESTS FAILED!');
if (!allPassed) process.exit(1);
