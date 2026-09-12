import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Dimensions, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import { CombinedChart } from '@/components/CombinedChart';
import { formatWeight, getCalorieZoneColor } from '@/lib/nutrition';

const { width } = Dimensions.get('window');

interface DailySummary {
  summary_date: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
}

interface WeightLog {
  id: string;
  weight: number;
  recorded_at: string;
  log_date?: string;
}

function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const renderLineSegment = (
  x1: number, y1: number, 
  x2: number, y2: number, 
  color: string, 
  key: string,
  thickness: number = 2
) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  const centerX = (x1 + x2) / 2;
  const centerY = (y1 + y2) / 2;

  return (
    <View
      key={key}
      style={{
        position: 'absolute',
        width: length,
        height: thickness,
        backgroundColor: color,
        left: centerX - length / 2,
        top: centerY - thickness / 2,
        transform: [{ rotate: `${angle}deg` }],
        borderRadius: thickness / 2,
      }}
    />
  );
};

export default function AnalyticsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [refreshing, setRefreshing] = useState(false);
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [weightTrendWidth, setWeightTrendWidth] = useState<number>(0);
  const [profileWeight, setProfileWeight] = useState<number | null>(null);
  const [startingWeight, setStartingWeight] = useState<number | null>(null);
  const [targetCalories, setTargetCalories] = useState(2000);
  const [maintenanceCalories, setMaintenanceCalories] = useState(2000);
  const [userGoal, setUserGoal] = useState<string | null>(null);
  const [checkInDates, setCheckInDates] = useState<string[]>([]);
  const [dailyExercises, setDailyExercises] = useState<{ date: string; burned: number }[]>([]);
  const [targetProtein, setTargetProtein] = useState(150);
  const [targetCarbs, setTargetCarbs] = useState(200);
  const [targetFat, setTargetFat] = useState(65);
  const [userGender, setUserGender] = useState<string | null>(null);
  const [userBmr, setUserBmr] = useState<number | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);

  const fetchAnalyticsData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch Profile (including weight_kg, starting_weight_kg, maintenance_calories, goal, gender, under_eating_threshold)
      const { data: profile } = await supabase
        .from('profiles')
        .select('target_calories, maintenance_calories, goal, target_protein, target_carbs, target_fat, weight_kg, starting_weight_kg, gender, under_eating_threshold')
        .eq('id', user.id)
        .single();
      
      if (profile) {
        setTargetCalories(profile.target_calories || 2000);
        setMaintenanceCalories(profile.maintenance_calories || profile.target_calories || 2000);
        setUserGoal(profile.goal || null);
        setUserGender(profile.gender || null);
        setUserBmr(profile.under_eating_threshold ? Number(profile.under_eating_threshold) : null);
        setTargetProtein(profile.target_protein || 150);
        setTargetCarbs(profile.target_carbs || 200);
        setTargetFat(profile.target_fat || 65);
        setProfileWeight(profile.weight_kg ? Number(profile.weight_kg) : null);
        setStartingWeight(profile.starting_weight_kg ? Number(profile.starting_weight_kg) : null);
      }

      // Fetch last 30 days summaries (so we have data for the dynamic window)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = formatLocalDate(thirtyDaysAgo);

      const { data: summaryData } = await supabase
        .from('daily_summaries')
        .select('*')
        .eq('user_id', user.id)
        .gte('summary_date', thirtyDaysAgoStr)
        .order('summary_date', { ascending: true });
      
      setSummaries(summaryData || []);

      // Fetch check-ins for vertical timeline classification
      const { data: checkInsData } = await supabase
        .from('check_ins')
        .select('check_in_date')
        .eq('user_id', user.id);

      if (checkInsData) {
        setCheckInDates(checkInsData.map(c => c.check_in_date));
      }

      // Fetch exercise logs for per-day activity credit
      const { data: exerciseData } = await supabase
        .from('exercises')
        .select('exercise_date, calories_burned')
        .eq('user_id', user.id)
        .gte('exercise_date', thirtyDaysAgoStr);

      if (exerciseData) {
        const burnedMap: { [date: string]: number } = {};
        for (const ex of exerciseData) {
          const d = ex.exercise_date;
          burnedMap[d] = (burnedMap[d] || 0) + (Number(ex.calories_burned) || 0);
        }
        setDailyExercises(Object.keys(burnedMap).map(date => ({ date, burned: burnedMap[date] })));
      }

      // Fetch weight logs (all available to allow historical forward & backward filling)
      const { data: weightData } = await supabase
        .from('weight_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('recorded_at', { ascending: true });

      setWeightLogs(weightData || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAnalyticsData();
    }, [fetchAnalyticsData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAnalyticsData();
    setRefreshing(false);
  };

  const bgColor = isDark ? '#0F172A' : '#F8FAFC';
  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';

  // --- Dynamic Window Logic (Timezone-Safe) ---
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let oldestLogDate = new Date(today);
  
  if (summaries.length > 0) {
    const [y, m, d] = summaries[0].summary_date.split('-').map(Number);
    const firstSummaryDate = new Date(y, m - 1, d);
    if (firstSummaryDate < oldestLogDate) oldestLogDate = firstSummaryDate;
  }
  
  if (weightLogs.length > 0) {
    const firstWeightStr = weightLogs[0].log_date || weightLogs[0].recorded_at.split('T')[0];
    const [y, m, d] = firstWeightStr.split('-').map(Number);
    const firstWeightDate = new Date(y, m - 1, d);
    if (firstWeightDate < oldestLogDate) oldestLogDate = firstWeightDate;
  }

  const daysSinceFirstLog = Math.floor((today.getTime() - oldestLogDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const chartDaysCount = Math.max(7, Math.min(30, daysSinceFirstLog));

  // Sort weight logs chronologically by date
  const sortedWeightLogs = [...weightLogs].sort((a, b) => {
    const dateA = a.log_date || (a.recorded_at ? a.recorded_at.split('T')[0] : '');
    const dateB = b.log_date || (b.recorded_at ? b.recorded_at.split('T')[0] : '');
    return dateA.localeCompare(dateB);
  });

  const todayStr = formatLocalDate(today);

  // Determine baseline weight for back-filling prior days
  const earliestLog = sortedWeightLogs[0];
  const earliestLogDate = earliestLog ? (earliestLog.log_date || (earliestLog.recorded_at ? earliestLog.recorded_at.split('T')[0] : '')) : null;
  const isOnlyTodayLogged = earliestLogDate === todayStr && sortedWeightLogs.length === 1;

  const fallbackBaselineWeight = isOnlyTodayLogged
    ? (startingWeight ?? profileWeight ?? (earliestLog ? Number(earliestLog.weight) : 70))
    : (sortedWeightLogs.length > 0 ? Number(sortedWeightLogs[0].weight) : (startingWeight ?? profileWeight ?? 70));

  // Format combined data
  const combinedData = Array.from({ length: chartDaysCount }).map((_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (chartDaysCount - 1 - i));
    const dateStr = formatLocalDate(d);
    const shortDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
    const isToday = dateStr === todayStr;
    const fullDateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    
    const summaryMatch = summaries.find(s => s.summary_date === dateStr);
    
    // Weight forward-fill: find the latest recorded log on or before dateStr
    let weightForDay: number | null = null;
    let latestLogDateStr = '';
    
    for (const w of sortedWeightLogs) {
      const wDateStr = w.log_date || (w.recorded_at ? w.recorded_at.split('T')[0] : '');
      if (wDateStr && wDateStr <= dateStr && wDateStr >= latestLogDateStr) {
        latestLogDateStr = wDateStr;
        weightForDay = Number(w.weight);
      }
    }

    // Back-fill: if dateStr is before the user's first log, use baseline or profile weight
    if (weightForDay === null) {
      weightForDay = fallbackBaselineWeight;
    }

    return {
      date: dateStr,
      label: shortDay,
      dayLabel: isToday ? 'Today' : weekday,
      weekday,
      isToday,
      fullDateLabel,
      calories: summaryMatch ? Number(summaryMatch.total_calories) : 0,
      protein: summaryMatch ? Number(summaryMatch.total_protein) : 0,
      carbs: summaryMatch ? Number(summaryMatch.total_carbs) : 0,
      fat: summaryMatch ? Number(summaryMatch.total_fat) : 0,
      weight: weightForDay,
    };
  });

  const last7Days = combinedData.slice(-7);
  const last7DaysDateRange = last7Days.length > 0
    ? `${last7Days[0].label} – ${last7Days[last7Days.length - 1].label}`
    : '';
  const maxCal = Math.max(targetCalories, ...last7Days.map(d => d.calories)) * 1.1 || 2500;
  
  // Averages based only on days logged
  const loggedDays = last7Days.filter(d => d.calories > 0);
  const numDaysLogged = loggedDays.length || 1; // avoid divide by zero
  
  const avgCal = loggedDays.reduce((sum, d) => sum + d.calories, 0) / numDaysLogged;
  const avgPro = loggedDays.reduce((sum, d) => sum + d.protein, 0) / numDaysLogged;
  const avgCarb = loggedDays.reduce((sum, d) => sum + d.carbs, 0) / numDaysLogged;
  const avgFat = loggedDays.reduce((sum, d) => sum + d.fat, 0) / numDaysLogged;

  // Weight Plot (defensive fallbacks to prevent -Infinity when weightLogs is empty)
  const maxWeight = weightLogs.length > 0 ? Math.max(...weightLogs.map(w => Number(w.weight))) : 70;
  const minWeight = weightLogs.length > 0 ? Math.min(...weightLogs.map(w => Number(w.weight))) : 70;
  const weightRange = maxWeight - minWeight || 10;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={textPrimary} />}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: textPrimary }]}>Insights</Text>
        </View>

        {/* Combined Line Chart */}
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text style={[styles.cardTitle, { color: textPrimary }]}>Progress Overview ({chartDaysCount} Days)</Text>
          <CombinedChart data={combinedData} targetCalories={targetCalories} isDark={isDark} checkInDates={checkInDates} />
        </View>

        {/* Calories Chart */}
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, { color: textPrimary }]}>Calories (Last 7 Days)</Text>
            {last7DaysDateRange ? (
              <Text style={[styles.cardDateRange, { color: textSecondary }]}>{last7DaysDateRange}</Text>
            ) : null}
          </View>

          {/* Interactive Day Details Banner */}
          {selectedDayIndex !== null && last7Days[selectedDayIndex] && (() => {
            const selectedDay = last7Days[selectedDayIndex];
            const dayBurned = dailyExercises.find(e => e.date === selectedDay.date)?.burned || 0;
            const dayActivityCredit = Math.round(dayBurned * 0.70);
            const dayTarget = targetCalories + dayActivityCredit;
            const dayMaintenance = maintenanceCalories + dayActivityCredit;
            const zone = getCalorieZoneColor(selectedDay.calories, dayTarget, dayMaintenance, userGoal, undefined, userGender, userBmr);
            const isCheckInDay = checkInDates.includes(selectedDay.date);

            const bannerBg = isDark 
              ? `${zone.color}25`
              : `${zone.color}15`;
            const bannerBorder = isDark 
              ? `${zone.color}55`
              : `${zone.color}40`;
            const iconName = zone.zone === 'target' 
              ? 'checkmark-circle-outline' 
              : zone.zone === 'undereating' 
                ? 'alert-circle-outline' 
                : 'warning-outline';

            return (
              <View style={[styles.selectedDayBadge, { backgroundColor: bannerBg, borderColor: bannerBorder }]}>
                <Ionicons name={iconName} size={14} color={zone.color} />
                <Text style={[styles.selectedDayText, { color: zone.color }]}>
                  {selectedDay.fullDateLabel}: {Math.round(selectedDay.calories)} kcal • {zone.label}
                  {dayActivityCredit > 0 ? ` (+${dayActivityCredit} bonus)` : ''}
                  {isCheckInDay ? ' • 🎯 Check-In Day' : ''}
                </Text>
              </View>
            );
          })()}

          <View style={styles.chartContainer}>
            {/* 1. Numbers Row above the bars */}
            <View style={styles.calNumbersRow}>
              {last7Days.map((day, i) => {
                const isSelected = selectedDayIndex === i;
                const dayBurned = dailyExercises.find(e => e.date === day.date)?.burned || 0;
                const dayActivityCredit = Math.round(dayBurned * 0.70);
                const dayTarget = targetCalories + dayActivityCredit;
                const dayMaintenance = maintenanceCalories + dayActivityCredit;
                const zone = getCalorieZoneColor(day.calories, dayTarget, dayMaintenance, userGoal, undefined, userGender, userBmr);

                return (
                  <View key={`cal-${i}`} style={styles.barCol}>
                    <Text 
                      numberOfLines={1}
                      style={[
                        styles.barCalLabel, 
                        { color: isSelected ? zone.color : textSecondary }
                      ]}
                    >
                      {day.calories > 0 ? Math.round(day.calories) : ''}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* 2. Bar Plotting Area with Shared Coordinate System */}
            <View style={[styles.barPlotArea, { height: 140 }]}>
              {/* Target Line - positioned at exact pixel height within the 140dp area */}
              <View 
                style={[
                  styles.targetLine, 
                  { 
                    bottom: Math.max(0, Math.min(139, Math.round((targetCalories / maxCal) * 140))),
                    borderColor: textSecondary,
                  }
                ]} 
              />

              {/* 7 Bars */}
              {last7Days.map((day, i) => {
                const isSelected = selectedDayIndex === i;
                const isCheckInDay = checkInDates.includes(day.date);
                const dayBurned = dailyExercises.find(e => e.date === day.date)?.burned || 0;
                const dayActivityCredit = Math.round(dayBurned * 0.70);
                const dayTarget = targetCalories + dayActivityCredit;
                const dayMaintenance = maintenanceCalories + dayActivityCredit;
                const zone = getCalorieZoneColor(day.calories, dayTarget, dayMaintenance, userGoal, undefined, userGender, userBmr);
                const fillHeight = Math.max(0, Math.min(140, Math.round((day.calories / maxCal) * 140)));

                return (
                  <Pressable 
                    key={`bar-${i}`} 
                    style={styles.barCol}
                    onPress={() => setSelectedDayIndex(isSelected ? null : i)}
                  >
                    {/* Check-In Subtle Vertical Line behind bar */}
                    {isCheckInDay && (
                      <View
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: '50%',
                          width: 1,
                          borderLeftWidth: 1,
                          borderColor: isDark ? 'rgba(99, 102, 241, 0.5)' : 'rgba(99, 102, 241, 0.45)',
                          borderStyle: 'dashed',
                          zIndex: 0,
                        }}
                      />
                    )}

                    <View style={[styles.barTrack, { height: 140 }]}>
                      <View 
                        style={[
                          styles.barFill, 
                          { 
                            height: fillHeight, 
                            backgroundColor: day.calories > 0 ? zone.color : 'transparent',
                          }
                        ]} 
                      />
                      {isSelected && (
                        <View 
                          style={[
                            StyleSheet.absoluteFill, 
                            {
                              borderRadius: 6,
                              borderWidth: 2,
                              borderColor: zone.color,
                              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                            }
                          ]}
                          pointerEvents="none"
                        />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* 3. Day Labels Row below the bars */}
            <View style={styles.dayLabelsRow}>
              {last7Days.map((day, i) => {
                const isSelected = selectedDayIndex === i;
                const isCheckInDay = checkInDates.includes(day.date);
                return (
                  <Pressable 
                    key={`label-${i}`} 
                    style={styles.barCol}
                    onPress={() => setSelectedDayIndex(isSelected ? null : i)}
                  >
                    <Text 
                      numberOfLines={1} 
                      adjustsFontSizeToFit 
                      minimumFontScale={0.7} 
                      ellipsizeMode="clip"
                      style={[
                        styles.barLabel, 
                        { 
                          color: isCheckInDay ? '#6366F1' : (day.isToday ? '#10B981' : (isSelected ? '#10B981' : textPrimary)),
                          fontWeight: (day.isToday || isSelected || isCheckInDay) ? '700' : '600',
                        }
                      ]}
                    >
                      {day.dayLabel}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={styles.chartLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
              <Text style={[styles.legendText, { color: textSecondary }]}>Under</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
              <Text style={[styles.legendText, { color: textSecondary }]}>On Target</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#A855F7' }]} />
              <Text style={[styles.legendText, { color: textSecondary }]}>Caution</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#9333EA' }]} />
              <Text style={[styles.legendText, { color: textSecondary }]}>Overeating</Text>
            </View>
            {checkInDates.length > 0 && (
              <View style={styles.legendItem}>
                <View style={{ width: 10, height: 1, borderTopWidth: 1, borderColor: '#6366F1', borderStyle: 'dashed' }} />
                <Text style={[styles.legendText, { color: textSecondary }]}>Check-In</Text>
              </View>
            )}
          </View>
        </View>

        {/* Macros Averages */}
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text style={[styles.cardTitle, { color: textPrimary, marginBottom: 4 }]}>7-Day Macro Averages</Text>
          <Text style={{ color: textSecondary, fontSize: 12, marginBottom: 20 }}>
            {loggedDays.length > 0 ? `Based on ${loggedDays.length} logged ${loggedDays.length === 1 ? 'day' : 'days'}` : 'No data logged'}
          </Text>
          
          <View style={styles.macroRow}>
            <View style={styles.macroInfo}>
              <Text style={[styles.macroName, { color: '#F43F5E' }]}>Protein</Text>
              <Text style={[styles.macroValue, { color: textPrimary }]}>{Math.round(avgPro)}g / {Math.round(targetProtein)}g</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { backgroundColor: '#F43F5E', width: `${Math.min(100, (avgPro / targetProtein) * 100)}%` }]} />
            </View>
          </View>

          <View style={styles.macroRow}>
            <View style={styles.macroInfo}>
              <Text style={[styles.macroName, { color: '#60A5FA' }]}>Carbs</Text>
              <Text style={[styles.macroValue, { color: textPrimary }]}>{Math.round(avgCarb)}g / {Math.round(targetCarbs)}g</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { backgroundColor: '#60A5FA', width: `${Math.min(100, (avgCarb / targetCarbs) * 100)}%` }]} />
            </View>
          </View>

          <View style={styles.macroRow}>
            <View style={styles.macroInfo}>
              <Text style={[styles.macroName, { color: '#FBBF24' }]}>Fat</Text>
              <Text style={[styles.macroValue, { color: textPrimary }]}>{Math.round(avgFat)}g / {Math.round(targetFat)}g</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { backgroundColor: '#FBBF24', width: `${Math.min(100, (avgFat / targetFat) * 100)}%` }]} />
            </View>
          </View>
        </View>

        {/* Weight Trend */}
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text style={[styles.cardTitle, { color: textPrimary }]}>Weight Trend (30 Days)</Text>
          {sortedWeightLogs.length > 1 ? (() => {
            const startingLog = sortedWeightLogs[0];
            const currentLog = sortedWeightLogs[sortedWeightLogs.length - 1];
            const startWeightNum = Number(startingLog.weight);
            const currentWeightNum = Number(currentLog.weight);
            const weightDiff = currentWeightNum - startWeightNum;
            const hasChanged = Math.abs(weightDiff) >= 0.05;

            const trendMinW = Math.min(...sortedWeightLogs.map(w => Number(w.weight)));
            const trendMaxW = Math.max(...sortedWeightLogs.map(w => Number(w.weight)));
            const trendSpread = trendMaxW - trendMinW;
            const trendPadding = trendSpread > 0 ? Math.max(0.12, trendSpread * 0.25) : 0.8;
            const trendMinY = trendMinW - trendPadding;
            const trendMaxY = trendMaxW + trendPadding;
            const trendRange = trendMaxY - trendMinY || 1.6;

            const chartAreaW = weightTrendWidth || (width - 100);
            const getTrendX = (i: number) => {
              return (i / Math.max(1, sortedWeightLogs.length - 1)) * (chartAreaW - 40) + 20;
            };
            const getTrendY = (w: number) => {
              return 120 - ((w - trendMinY) / trendRange) * 80 - 20;
            };

            const startDateObj = new Date(startingLog.log_date ? `${startingLog.log_date}T00:00:00` : startingLog.recorded_at);
            const currentDateObj = new Date(currentLog.log_date ? `${currentLog.log_date}T00:00:00` : currentLog.recorded_at);

            return (
              <View style={styles.weightChartContainer}>
                <View 
                  style={styles.weightChartArea}
                  onLayout={(e) => setWeightTrendWidth(e.nativeEvent.layout.width)}
                >
                  {/* Check-In Vertical Lines */}
                  {checkInDates.length > 0 && sortedWeightLogs.map((log, i) => {
                    const logDate = log.log_date || (log.recorded_at ? log.recorded_at.split('T')[0] : '');
                    if (!checkInDates.includes(logDate)) return null;
                    const x = getTrendX(i);
                    return (
                      <View
                        key={`weight-checkin-${log.id}`}
                        style={{
                          position: 'absolute',
                          left: x,
                          top: 0,
                          bottom: 0,
                          width: 1,
                          borderLeftWidth: 1,
                          borderColor: isDark ? 'rgba(99, 102, 241, 0.45)' : 'rgba(99, 102, 241, 0.4)',
                          borderStyle: 'dashed',
                          zIndex: 1,
                        }}
                      />
                    );
                  })}

                  {/* Connecting Line Segments */}
                  {sortedWeightLogs.map((log, i) => {
                    if (i >= sortedWeightLogs.length - 1) return null;
                    const nextLog = sortedWeightLogs[i + 1];
                    return renderLineSegment(
                      getTrendX(i),
                      getTrendY(Number(log.weight)),
                      getTrendX(i + 1),
                      getTrendY(Number(nextLog.weight)),
                      '#8B5CF6',
                      `trend-line-${i}`,
                      3
                    );
                  })}

                  {/* Dots */}
                  {sortedWeightLogs.map((log, i) => {
                    const x = getTrendX(i);
                    const y = getTrendY(Number(log.weight));
                    return (
                      <View 
                        key={log.id} 
                        style={[
                          styles.weightDot, 
                          { 
                            left: x - 4.5, 
                            top: y - 4.5,
                            width: 9,
                            height: 9,
                            borderRadius: 4.5,
                            backgroundColor: '#8B5CF6',
                            borderColor: isDark ? '#1E293B' : '#FFF',
                            borderWidth: 1.5,
                            marginLeft: 0,
                            marginBottom: 0,
                          }
                        ]} 
                      />
                    );
                  })}

                  {/* Starting Weight Milestone Tag */}
                  {hasChanged && (
                    <View
                      style={{
                        position: 'absolute',
                        left: Math.max(0, Math.min(chartAreaW - 65, getTrendX(0) - 20)),
                        top: Math.max(0, Math.min(120 - 26, getTrendY(startWeightNum) - 24)),
                        backgroundColor: isDark ? 'rgba(30, 41, 59, 0.92)' : 'rgba(255, 255, 255, 0.95)',
                        borderColor: textSecondary,
                        borderWidth: 1,
                        borderRadius: 6,
                        paddingHorizontal: 5,
                        paddingVertical: 2,
                        elevation: 2,
                      }}
                    >
                      <Text style={{ fontSize: 9.5, fontWeight: '600', color: textSecondary }}>
                        {formatWeight(startWeightNum)} kg
                      </Text>
                    </View>
                  )}

                  {/* Latest Weight Floating Tag */}
                  <View
                    style={{
                      position: 'absolute',
                      left: Math.max(0, Math.min(chartAreaW - 78, getTrendX(sortedWeightLogs.length - 1) - 40)),
                      top: Math.max(0, Math.min(120 - 26, getTrendY(currentWeightNum) - 24)),
                      backgroundColor: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.98)',
                      borderColor: '#8B5CF6',
                      borderWidth: 1.5,
                      borderRadius: 6,
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      shadowColor: '#8B5CF6',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.25,
                      shadowRadius: 3,
                      elevation: 3,
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#8B5CF6' }}>
                      {formatWeight(currentWeightNum)} kg{hasChanged ? ` (${weightDiff > 0 ? '+' : ''}${formatWeight(weightDiff)})` : ''}
                    </Text>
                  </View>
                </View>

                {/* Date Labels below chart */}
                <View style={styles.weightLabels}>
                  <Text numberOfLines={1} style={[styles.weightLabelText, { color: textSecondary }]}>
                    {startDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                  <Text numberOfLines={1} style={[styles.weightLabelText, { color: textSecondary }]}>
                    {currentDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                </View>

                {/* Summary Stats */}
                <View style={styles.weightStats}>
                  <View style={styles.weightStatBox}>
                    <Text style={[styles.weightStatLabel, { color: textSecondary }]}>Starting</Text>
                    <Text style={[styles.weightStatValue, { color: textPrimary }]}>{formatWeight(startWeightNum)} kg</Text>
                  </View>
                  <View style={styles.weightStatBox}>
                    <Text style={[styles.weightStatLabel, { color: textSecondary }]}>Current</Text>
                    <Text style={[styles.weightStatValue, { color: textPrimary }]}>{formatWeight(currentWeightNum)} kg</Text>
                  </View>
                  <View style={styles.weightStatBox}>
                    <Text style={[styles.weightStatLabel, { color: textSecondary }]}>Change</Text>
                    <Text style={[
                      styles.weightStatValue, 
                      { color: weightDiff < 0 ? '#10B981' : (weightDiff > 0 ? '#EF4444' : textSecondary) }
                    ]}>
                      {weightDiff < 0 ? '-' : (weightDiff > 0 ? '+' : '')}
                      {formatWeight(Math.abs(weightDiff))} kg
                    </Text>
                  </View>
                </View>
              </View>
            );
          })() : (
            <Text style={{ color: textSecondary, fontStyle: 'italic', paddingVertical: 20, textAlign: 'center' }}>
              Not enough weight data to show a trend. Log your weight for a few days!
            </Text>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  card: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  cardDateRange: {
    fontSize: 12,
    fontWeight: '600',
  },
  selectedDayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  selectedDayText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chartContainer: {
    position: 'relative',
    paddingVertical: 10,
  },
  calNumbersRow: {
    flexDirection: 'row',
    height: 18,
    marginBottom: 6,
    alignItems: 'center',
  },
  barPlotArea: {
    flexDirection: 'row',
    position: 'relative',
    alignItems: 'flex-end',
  },
  dayLabelsRow: {
    flexDirection: 'row',
    height: 22,
    marginTop: 8,
    alignItems: 'center',
  },
  barCol: {
    alignItems: 'center',
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    paddingHorizontal: 1,
  },
  barTrack: {
    width: 18,
    maxWidth: '75%',
    backgroundColor: 'rgba(150,150,150,0.1)',
    justifyContent: 'flex-end',
    borderRadius: 6,
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 6,
  },
  barCalLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  barLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  targetLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    zIndex: 1,
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 16,
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLine: {
    width: 12,
    height: 2,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '500',
  },
  macroRow: {
    marginBottom: 16,
  },
  macroInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  macroName: {
    fontSize: 15,
    fontWeight: '700',
  },
  macroValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  progressTrack: {
    height: 8,
    backgroundColor: 'rgba(150,150,150,0.2)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  weightChartContainer: {
    marginTop: 10,
  },
  weightChartArea: {
    height: 120,
    position: 'relative',
    marginHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150,150,150,0.2)',
  },
  weightDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: -4,
    marginBottom: -4,
  },
  weightLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  weightLabelText: {
    fontSize: 11,
    fontWeight: '500',
  },
  weightStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150,150,150,0.1)',
  },
  weightStatBox: {
    alignItems: 'center',
  },
  weightStatLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  weightStatValue: {
    fontSize: 16,
    fontWeight: '700',
  },
});
