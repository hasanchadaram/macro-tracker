import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  withDelay,
  withSpring,
  withRepeat,
  withSequence,
  Easing,
  useAnimatedProps,
} from 'react-native-reanimated';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import { useAlert } from '@/components/ui/CustomAlert';
import { AttentionBeacon } from '@/components/ui/AttentionBeacon';
import * as Haptics from 'expo-haptics';
import { getCalorieZoneColor, getCalorieSafetyFloor } from '@/lib/nutrition';

import { TextInput } from 'react-native';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

function CountingNumber({ value, isLoading, style, prefix = '', suffix = '', date }: { value: number; isLoading?: boolean; style: any; prefix?: string; suffix?: string; date?: string }) {
  const animatedValue = useSharedValue(value || 0);
  const prevDateRef = React.useRef(date);
  const isFirstLoadRef = React.useRef(true);
  const prevValueRef = React.useRef(value);
  const prevLoadingRef = React.useRef(isLoading);

  useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = isLoading;

    if (isLoading) {
      return;
    }

    const isDateChange = date !== undefined && date !== prevDateRef.current;
    prevDateRef.current = date;
    const justFinishedLoading = wasLoading && !isLoading;

    if (isFirstLoadRef.current || isDateChange || justFinishedLoading) {
      isFirstLoadRef.current = false;
      prevValueRef.current = value;
      animatedValue.value = 0;
      animatedValue.value = withDelay(justFinishedLoading ? 50 : 200, withTiming(value, { duration: 800, easing: Easing.out(Easing.cubic) }));
    } else {
      // In-place update: roll directly from CURRENT value to NEW value!
      if (prevValueRef.current !== value) {
        prevValueRef.current = value;
        animatedValue.value = withTiming(value, { duration: 600, easing: Easing.out(Easing.cubic) });
      }
    }
  }, [value, isLoading, date]);

  const animatedProps = useAnimatedProps(() => {
    return {
      text: isLoading ? '...' : `${prefix}${Math.round(animatedValue.value)}${suffix}`,
    } as any;
  });

  return (
    <AnimatedTextInput
      underlineColorAndroid="transparent"
      editable={false}
      value={isLoading ? '...' : `${prefix}${Math.round(value)}${suffix}`}
      animatedProps={animatedProps}
      style={[style, { padding: 0, margin: 0, includeFontPadding: false }]}
    />
  );
}

const PureCircularProgress = ({ size, strokeWidth, progress, ringColor, trackColor, cardBg, children }: any) => {
  const half = size / 2;
  const S = size;
  const topOffset = S * 0.7071 - half;

  const leftProgressStyle = useAnimatedStyle(() => {
    const p = typeof progress === 'number' ? progress : progress.value;
    const clamped = Math.min(100, Math.max(0, p));
    const leftRotate = clamped >= 50 ? 180 : 45 + (clamped / 50) * 135;
    return {
      transform: [{ rotate: `${leftRotate}deg` }],
    };
  });

  const rightProgressStyle = useAnimatedStyle(() => {
    const p = typeof progress === 'number' ? progress : progress.value;
    const clamped = Math.min(100, Math.max(0, p));
    const rightRotate = clamped <= 50 ? 0 : ((clamped - 50) / 50) * 135;
    return {
      transform: [{ rotate: `${rightRotate}deg` }],
    };
  });

  const startCapStyle = useAnimatedStyle(() => {
    const p = typeof progress === 'number' ? progress : progress.value;
    return {
      opacity: p > 0 ? 1 : 0,
    };
  });

  const tipProgressStyle = useAnimatedStyle(() => {
    const p = typeof progress === 'number' ? progress : progress.value;
    const clamped = Math.min(100, Math.max(0, p));
    const tipRotation = 225 + (clamped / 100) * 270;
    return {
      opacity: clamped > 0 ? 1 : 0,
      transform: [{ rotate: `${tipRotation}deg` }],
    };
  });

  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      
      {/* 1. Base Track (Full Circle) */}
      <View style={{
        position: 'absolute', width: size, height: size, borderRadius: half,
        borderWidth: strokeWidth, borderColor: trackColor
      }} />
      
      {/* 2. Progress Left */}
      <View style={{ position: 'absolute', left: 0, width: half, height: size, overflow: 'hidden' }}>
        <Animated.View style={[{
          position: 'absolute', left: 0, width: size, height: size,
        }, leftProgressStyle]}>
          {/* Half-Ring for the right side */}
          <View style={{ position: 'absolute', right: 0, width: half, height: size, overflow: 'hidden' }}>
            <View style={{
              position: 'absolute', right: 0, width: size, height: size, borderRadius: half,
              borderWidth: strokeWidth, borderColor: ringColor
            }} />
          </View>
        </Animated.View>
      </View>

      {/* 3. Progress Right */}
      <View style={{ position: 'absolute', right: 0, width: half, height: size, overflow: 'hidden' }}>
        <Animated.View style={[{
          position: 'absolute', right: 0, width: size, height: size,
        }, rightProgressStyle]}>
          {/* Half-Ring for the left side */}
          <View style={{ position: 'absolute', left: 0, width: half, height: size, overflow: 'hidden' }}>
            <View style={{
              position: 'absolute', left: 0, width: size, height: size, borderRadius: half,
              borderWidth: strokeWidth, borderColor: ringColor
            }} />
          </View>
        </Animated.View>
      </View>

      {/* 4. Gap Cutout (Masks the overlapping arcs in the bottom gap) */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, width: size, height: half, overflow: 'hidden' }}>
        <View style={{
          position: 'absolute', left: 0, top: topOffset, width: size, height: size,
          backgroundColor: cardBg,
          transform: [{ rotate: '45deg' }]
        }} />
      </View>

      {/* 5. Rounded Caps for Track Ends */}
      <View style={{ position: 'absolute', width: size, height: size, transform: [{ rotate: '225deg' }] }}>
        <View style={{ position: 'absolute', top: 0, left: half - strokeWidth/2, width: strokeWidth, height: strokeWidth, borderRadius: strokeWidth/2, backgroundColor: trackColor }} />
      </View>
      <View style={{ position: 'absolute', width: size, height: size, transform: [{ rotate: '135deg' }] }}>
        <View style={{ position: 'absolute', top: 0, left: half - strokeWidth/2, width: strokeWidth, height: strokeWidth, borderRadius: strokeWidth/2, backgroundColor: trackColor }} />
      </View>

      {/* 6. Rounded Caps for Progress Start (225deg) */}
      <Animated.View style={[{ position: 'absolute', width: size, height: size, transform: [{ rotate: '225deg' }] }, startCapStyle]}>
        <View style={{ position: 'absolute', top: 0, left: half - strokeWidth/2, width: strokeWidth, height: strokeWidth, borderRadius: strokeWidth/2, backgroundColor: ringColor }} />
      </Animated.View>

      {/* 7. Rounded Cap for Progress Tip */}
      <Animated.View style={[{ position: 'absolute', width: size, height: size }, tipProgressStyle]}>
        <View style={{ position: 'absolute', top: 0, left: half - strokeWidth/2, width: strokeWidth, height: strokeWidth, borderRadius: strokeWidth/2, backgroundColor: ringColor }} />
      </Animated.View>

      {children}
    </View>
  );
};

interface DailySummaryProps {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  targetCalories?: number | null;
  baseTargetCalories?: number | null;
  activityCredit?: number;
  maintenanceCalories?: number | null;
  targetProtein?: number | null;
  targetCarbs?: number | null;
  targetFat?: number | null;
  burnedCalories?: number;
  underEatingThreshold?: number | null;
  goal?: string | null;
  gender?: string | null;
  bmr?: number | null;
  isLoading?: boolean;
  date?: string;
}

export function DailySummaryCard({ 
  calories, protein, carbs, fat, 
  targetCalories, baseTargetCalories, activityCredit = 0,
  maintenanceCalories, targetProtein, targetCarbs, targetFat,
  burnedCalories = 0,
  underEatingThreshold,
  goal,
  gender,
  bmr,
  isLoading,
  date,
}: DailySummaryProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { showAlert } = useAlert();

  const tCals = targetCalories || 2000;
  const baseMaintenance = maintenanceCalories || tCals;
  const effectiveTDEE = baseMaintenance + (activityCredit || 0);
  const tPro = targetProtein || 150;
  const tCarbs = targetCarbs || 250;
  const tFat = targetFat || 70;

  const remainingCals = Math.max(0, tCals - calories);
  const getPercent = (current: number, max: number) => Math.min(100, (current / max) * 100);

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const macroBg = isDark ? '#0F172A' : '#F1F5F9';
  
  // ── Under-eating and Over-eating Thresholds ──────────────────
  // Rule: Calorie intake should be more than BMR, more than 1200 (female)/1500 (male), and more than TDEE - 500
  const bmrValue = bmr && bmr > 0 ? bmr : (underEatingThreshold && underEatingThreshold > 0 ? underEatingThreshold : 0);
  const effectiveUnderEatingThreshold = getCalorieSafetyFloor(gender, effectiveTDEE, bmrValue);

  // Calorie Bar & Ring Color strictly synchronized with Undereating / Overeating state:
  // - Red (#EF4444): Undereating (calories < effectiveUnderEatingThreshold)
  // - Green (#10B981): On Target (effectiveUnderEatingThreshold <= calories < effectiveTDEE + 400)
  // - Normal Purple (#A855F7): Overeating Caution (effectiveTDEE + 400 <= calories <= effectiveTDEE + 500)
  // - Intense Purple (#9333EA): High Surplus Alert (calories > effectiveTDEE + 500)
  const zoneResult = getCalorieZoneColor(
    calories,
    tCals,
    effectiveTDEE,
    goal,
    effectiveUnderEatingThreshold,
    gender,
    bmrValue
  );

  // Single Source of Truth: beacon icons and ringColor are 100% in lockstep sync
  const surplus = calories - effectiveTDEE;
  const isUnderEating = calories > 0 && zoneResult.zone === 'undereating';
  const isOverEatingCaution = zoneResult.zone === 'caution';
  const isOverEatingAlert = zoneResult.zone === 'alert';
  const hasAlert = isUnderEating || isOverEatingCaution || isOverEatingAlert;
  const ringColor = calories > 0 ? zoneResult.color : (isDark ? '#34D399' : '#10B981');

  const trackColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

  // ── Entrance Animations ────────────────────────────────────
  const ringProgress = useSharedValue(0);

  // Macro bar widths (animated)
  const proteinBarWidth = useSharedValue(0);
  const carbsBarWidth = useSharedValue(0);
  const fatBarWidth = useSharedValue(0);

  // Macro card opacity (staggered fade-in)
  const proteinOpacity = useSharedValue(0);
  const carbsOpacity = useSharedValue(0);
  const fatOpacity = useSharedValue(0);

  const calPercent = getPercent(calories, tCals);

  const isFirstLoadRef = React.useRef(true);
  const prevDateRef = React.useRef(date);
  const prevLoadingRef = React.useRef(isLoading);
  const prevMetricsRef = React.useRef({
    calories: -1,
    protein: -1,
    carbs: -1,
    fat: -1,
    calPercent: -1,
    tPro: -1,
    tCarbs: -1,
    tFat: -1,
  });

  useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = isLoading;

    if (isLoading) {
      return;
    }

    const isDateChange = date !== undefined && date !== prevDateRef.current;
    prevDateRef.current = date;
    const justFinishedLoading = wasLoading && !isLoading;

    const prev = prevMetricsRef.current;
    const hasChanged =
      isDateChange ||
      justFinishedLoading ||
      prev.calories !== calories ||
      prev.protein !== protein ||
      prev.carbs !== carbs ||
      prev.fat !== fat ||
      prev.calPercent !== calPercent ||
      prev.tPro !== tPro ||
      prev.tCarbs !== tCarbs ||
      prev.tFat !== tFat;

    if (!isFirstLoadRef.current && !hasChanged) {
      return;
    }

    const isEntrance = isFirstLoadRef.current || isDateChange || justFinishedLoading;
    isFirstLoadRef.current = false;
    prevMetricsRef.current = {
      calories,
      protein,
      carbs,
      fat,
      calPercent,
      tPro,
      tCarbs,
      tFat,
    };

    const timeoutIds: ReturnType<typeof setTimeout>[] = [];

    if (isEntrance) {
      // ── 1. ENTRANCE / DATE CHANGE ANIMATION (From 0) ──
      // Rotary sweeping ticks for the calorie ring (200ms to 900ms)
      for (let i = 0; i < 12; i++) {
        const timeOffset = 700 * Math.pow(i / 11, 1.5);
        timeoutIds.push(setTimeout(() => Haptics.selectionAsync(), 200 + timeOffset));
      }

      // Macro bars hitting with the 3 distinct satisfying haptic hits at the end
      timeoutIds.push(setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 1100));
      timeoutIds.push(setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 1250));
      timeoutIds.push(setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 1400));
      timeoutIds.push(setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 1510));

      // Ring progress — animate after card appears
      ringProgress.value = 0;
      ringProgress.value = withDelay(200, withTiming(calPercent, { duration: 800, easing: Easing.out(Easing.cubic) }));

      // Macro bars — staggered after ring finishes
      const barDelay = 1100;
      const barDuration = 700;
      const barEasing = Easing.out(Easing.cubic);
      const barStagger = 150; // Increased stagger from 120ms to 150ms for better distinction

      proteinBarWidth.value = 0;
      carbsBarWidth.value = 0;
      fatBarWidth.value = 0;
      proteinOpacity.value = 0;
      carbsOpacity.value = 0;
      fatOpacity.value = 0;

      proteinOpacity.value = withDelay(barDelay, withTiming(1, { duration: 300 }));
      proteinBarWidth.value = withDelay(barDelay, withTiming(getPercent(protein, tPro), { duration: barDuration, easing: barEasing }));

      carbsOpacity.value = withDelay(barDelay + barStagger, withTiming(1, { duration: 300 }));
      carbsBarWidth.value = withDelay(barDelay + barStagger, withTiming(getPercent(carbs, tCarbs), { duration: barDuration, easing: barEasing }));

      fatOpacity.value = withDelay(barDelay + barStagger * 2, withTiming(1, { duration: 300 }));
      fatBarWidth.value = withDelay(barDelay + barStagger * 2, withTiming(getPercent(fat, tFat), { duration: barDuration, easing: barEasing }));
    } else {
      // ── 2. IN-PLACE UPDATE (Meal/Exercise Add, Edit, Delete on same date) ──
      // Animate directly from CURRENT values to NEW values (do not reset to 0!)
      for (let i = 0; i < 6; i++) {
        const delay = Math.round(450 * Math.pow(i / 5, 1.4));
        timeoutIds.push(setTimeout(() => Haptics.selectionAsync(), delay));
      }
      timeoutIds.push(setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 500));
      timeoutIds.push(setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 620));

      ringProgress.value = withTiming(calPercent, { duration: 600, easing: Easing.out(Easing.cubic) });

      proteinOpacity.value = 1;
      carbsOpacity.value = 1;
      fatOpacity.value = 1;

      proteinBarWidth.value = withTiming(getPercent(protein, tPro), { duration: 600, easing: Easing.out(Easing.cubic) });
      carbsBarWidth.value = withTiming(getPercent(carbs, tCarbs), { duration: 600, easing: Easing.out(Easing.cubic) });
      fatBarWidth.value = withTiming(getPercent(fat, tFat), { duration: 600, easing: Easing.out(Easing.cubic) });
    }

    return () => {
      timeoutIds.forEach(clearTimeout);
    };
  }, [calories, protein, carbs, fat, calPercent, tPro, tCarbs, tFat, isLoading, date]);


  const proteinBarStyle = useAnimatedStyle(() => ({
    width: `${proteinBarWidth.value}%` as any,
    backgroundColor: '#F43F5E',
  }));

  const carbsBarStyle = useAnimatedStyle(() => ({
    width: `${carbsBarWidth.value}%` as any,
    backgroundColor: '#60A5FA',
  }));

  const fatBarStyle = useAnimatedStyle(() => ({
    width: `${fatBarWidth.value}%` as any,
    backgroundColor: '#FBBF24',
  }));

  const proteinCardStyle = useAnimatedStyle(() => ({ opacity: proteinOpacity.value }));
  const carbsCardStyle = useAnimatedStyle(() => ({ opacity: carbsOpacity.value }));
  const fatCardStyle = useAnimatedStyle(() => ({ opacity: fatOpacity.value }));



  const handleUnderEatingPress = () => {
    const diff = Math.round(effectiveUnderEatingThreshold - calories);
    showAlert(
      'Eat More to Fuel Your Body!',
      `You need ${Math.ceil(diff)} more kcal to hit your minimum requirement (${Math.round(effectiveUnderEatingThreshold)} kcal).\n\nEating too little causes muscle loss, severe energy drops, and metabolic adaptation. Make sure to properly fuel your body!`,
      [
        { text: 'Got It', style: 'cancel' },
        {
          text: 'Why This Matters',
          onPress: () => {
            showAlert(
              '⚠️ Risks of Eating Below BMR',
              'When you consistently consume fewer calories than your BMR, your body treats it as a famine and triggers a cascade of negative side effects:\n\n' +
              '• Metabolic Slowdown: Your body downregulates its metabolic rate to match your restricted intake, making future weight loss incredibly difficult and causing rapid weight regain when you stop.\n\n' +
              '• Muscle Wasting: To find energy, your body begins breaking down its own lean muscle tissue and organs rather than just body fat.\n\n' +
              '• Hormonal Crash: In women, it often causes amenorrhea (loss of menstrual period). In men, it tanks testosterone levels.\n\n' +
              '• Physical Symptoms: Chronic fatigue, constant hair loss, feeling unusually cold all the time, and severe brain fog.'
            );
          },
        },
      ]
    );
  };

  const handleOverEatingCautionPress = () => {
    const diff = Math.round(surplus);
    const exerciseText = activityCredit > 0 ? ` (including +${Math.round(activityCredit)} kcal earned from exercise today)` : '';
    showAlert(
      'Time to Slow Down!',
      `You are currently ${diff} kcal above your daily maintenance level (${Math.round(effectiveTDEE)} kcal${exerciseText}).\n\nA moderate surplus is fine on occasion, but eating further above maintenance will lead to unwanted fat gain. Consider pacing your calorie intake for the rest of the day!`
    );
  };

  const handleOverEatingAlertPress = () => {
    const diff = Math.round(surplus);
    const exerciseText = activityCredit > 0 ? ` (including +${Math.round(activityCredit)} kcal earned from exercise today)` : '';
    showAlert(
      'High Calorie Surplus Alert!',
      `You have consumed ${diff} kcal above your daily maintenance level today (${Math.round(calories)} kcal total vs ${Math.round(effectiveTDEE)} kcal maintenance${exerciseText}).\n\nA large surplus causes significant fat accumulation. If your goal is staying lean or managing weight, consider stopping further calorie consumption today and resetting fresh tomorrow!`
    );
  };

  const handleTargetBudgetPress = () => {
    if (activityCredit && activityCredit > 0 && baseTargetCalories) {
      const base = Math.round(baseTargetCalories);
      const credit = Math.round(activityCredit);
      const total = Math.round(tCals);
      const burned = Math.round(burnedCalories);
      showAlert(
        '⚡ Daily Calorie Budget',
        `• Base Goal: ${base} kcal\n• Activity Bonus: +${credit} kcal (70% of ${burned} kcal burned)\n─────────────────────\n• Total Target: ${total} kcal\n\nBurning calories through workouts increases your daily calorie allowance so you can fuel your recovery!`
      );
    }
  };

  const handleBurnedCardPress = () => {
    if (burnedCalories > 0) {
      const credit = activityCredit && activityCredit > 0 ? Math.round(activityCredit) : Math.round(burnedCalories * 0.7);
      showAlert(
        '🔥 Burned Calories',
        `You burned ${Math.round(burnedCalories)} kcal through exercise today.\n\n70% (+${credit} kcal) has been added to your daily calorie budget to properly fuel your activity.`
      );
    } else {
      showAlert(
        '🔥 Burned Calories',
        'Log your workouts or connect Health Connect to track burned calories and earn activity bonus calories automatically!'
      );
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.mainCard, { backgroundColor: cardBg }]}>
        
        {/* Undereating Icon (Red) */}
        {isUnderEating && (
          <Pressable style={styles.infoButton} onPress={handleUnderEatingPress}>
            <AttentionBeacon color="#EF4444" size={26} showHalo={false}>
              <Ionicons name="information-circle" size={24} color="#EF4444" />
            </AttentionBeacon>
          </Pressable>
        )}

        {/* Overeating Caution Icon (Purple - 500-600 surplus) */}
        {isOverEatingCaution && (
          <Pressable style={styles.infoButton} onPress={handleOverEatingCautionPress}>
            <AttentionBeacon color="#A855F7" size={26} showHalo={false}>
              <Ionicons name="information-circle" size={24} color="#A855F7" />
            </AttentionBeacon>
          </Pressable>
        )}

        {/* Overeating High Alert Icon (Intense Purple - >500 surplus) */}
        {isOverEatingAlert && (
          <Pressable style={styles.infoButton} onPress={handleOverEatingAlertPress}>
            <AttentionBeacon color="#9333EA" size={26} showHalo={false}>
              <Ionicons name="warning" size={24} color="#9333EA" />
            </AttentionBeacon>
          </Pressable>
        )}
        
        {/* Central Rings Row */}
        <View style={styles.ringsRow}>
          <View style={styles.sideStat}>
            <Text style={[styles.sideStatLabel, { color: textSecondary }]}>Eaten</Text>
            <CountingNumber value={Math.round(calories)} isLoading={isLoading} date={date} style={[styles.sideStatValue, { color: textPrimary }]} />
          </View>

          <View style={styles.centerRingWrapper}>
            <PureCircularProgress
              size={160}
              strokeWidth={10}
              progress={ringProgress}
              ringColor={ringColor}
              trackColor={trackColor}
              cardBg={cardBg}
            >
              <Pressable
                style={styles.centerRingContent}
                onPress={handleTargetBudgetPress}
                disabled={!activityCredit || activityCredit <= 0}
              >
                <Text style={[styles.ringLabel, { color: textSecondary }]}>Remaining</Text>
                <CountingNumber value={Math.round(remainingCals)} isLoading={isLoading} date={date} style={[styles.ringValue, { color: textPrimary }]} />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                  <Text style={[styles.ringSub, { color: textSecondary }]}>/ {Math.round(tCals)} kcal</Text>
                  {activityCredit && activityCredit > 0 ? (
                    <Ionicons name="flash" size={11} color="#F59E0B" />
                  ) : null}
                </View>
              </Pressable>
            </PureCircularProgress>
          </View>

          <Pressable style={styles.sideStat} onPress={handleBurnedCardPress}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Text style={[styles.sideStatLabel, { color: textSecondary }]}>Burned</Text>
              <Ionicons name="information-circle-outline" size={11} color={textSecondary} />
            </View>
            <CountingNumber value={Math.round(burnedCalories)} isLoading={isLoading} date={date} style={[styles.sideStatValue, { color: '#F59E0B' }]} />
          </Pressable>
        </View>

        {/* Macros Row */}
        <View style={styles.macrosRow}>
          {/* Protein */}
          <Animated.View style={[styles.macroCard, { backgroundColor: macroBg }, proteinCardStyle]}>
            <Text style={[styles.macroName, { color: textPrimary }]}>Protein</Text>
            <Text style={[styles.macroAmount, { color: textSecondary }]}>{isLoading ? '...' : `${Math.round(protein)} / ${Math.round(tPro)}g`}</Text>
            <View style={styles.progressBarBg}>
              <Animated.View style={[styles.progressBarFill, proteinBarStyle]} />
            </View>
          </Animated.View>

          {/* Carbs */}
          <Animated.View style={[styles.macroCard, { backgroundColor: macroBg }, carbsCardStyle]}>
            <Text style={[styles.macroName, { color: textPrimary }]}>Carbs</Text>
            <Text style={[styles.macroAmount, { color: textSecondary }]}>{isLoading ? '...' : `${Math.round(carbs)} / ${Math.round(tCarbs)}g`}</Text>
            <View style={styles.progressBarBg}>
              <Animated.View style={[styles.progressBarFill, carbsBarStyle]} />
            </View>
          </Animated.View>

          {/* Fat */}
          <Animated.View style={[styles.macroCard, { backgroundColor: macroBg }, fatCardStyle]}>
            <Text style={[styles.macroName, { color: textPrimary }]}>Fat</Text>
            <Text style={[styles.macroAmount, { color: textSecondary }]}>{isLoading ? '...' : `${Math.round(fat)} / ${Math.round(tFat)}g`}</Text>
            <View style={styles.progressBarBg}>
              <Animated.View style={[styles.progressBarFill, fatBarStyle]} />
            </View>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  mainCard: {
    borderRadius: 24,
    paddingTop: 20,
    paddingBottom: 18,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
    position: 'relative',
  },
  infoButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 4,
  },
  ringsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 10
  },
  sideStat: {
    flex: 1,
    alignItems: 'center',
  },
  sideStatLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 4,
  },
  sideStatValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  centerRingWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerRingContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  ringValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  ringSub: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  macrosRow: {
    flexDirection: 'row',
    gap: 12,
  },
  macroCard: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
  },
  macroName: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  macroAmount: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 8,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(150, 150, 150, 0.2)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
});
