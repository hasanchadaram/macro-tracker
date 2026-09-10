import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Dimensions,
  AppState,
  AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import type { FoodItem, MealEstimate, MealTotals, MealEntry, RecentFood, Profile, ExerciseEntry, WeightLog, CheckInRecommendation } from '@/lib/types';
import { ExerciseSource, CalculationMethod } from '@/lib/constants';
import { getLocalDateString, getLocalDayBoundsIso } from '@/lib/dateUtils';
import { evaluateWeeklyCheckIn } from '@/lib/nutrition';

import { DailySummaryCard } from '@/components/DailySummaryCard';
import { MealSection } from '@/components/MealSection';
import { AddFoodModal } from '@/components/AddFoodModal';
import { ScanningLoader } from '@/components/ScanningLoader';
import { invokeScanFoodWithProgress } from '@/lib/scan';
import { MealReviewModal } from '@/components/MealReviewModal';
import { OnboardingModal } from '@/components/OnboardingModal';
import { AddExerciseModal } from '@/components/AddExerciseModal';
import { initCatalog } from '@/lib/compendiumCatalog';
import { ExerciseSection } from '@/components/ExerciseSection';
import { WeightSection } from '@/components/WeightSection';
import { LogWeightModal } from '@/components/LogWeightModal';
import { CalendarModal } from '@/components/CalendarModal';
import { CheckInBanner } from '@/components/CheckInBanner';
import { WeeklyCheckInModal } from '@/components/WeeklyCheckInModal';
import { useHealthConnect } from '@/hooks/useHealthConnect';
import { useAlert } from '@/components/ui/CustomAlert';
import { SpotlightWalkthrough } from '@/components/SpotlightWalkthrough';
import { RepeatMealSelectorModal, type RepeatMealCandidate } from '@/components/RepeatMealSelectorModal';
import UserAvatar from '@/components/UserAvatar';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

const MEAL_TYPES = [
  { title: 'Breakfast', icon: 'sunny-outline' as const, color: '#10B981' },
  { title: 'Lunch', icon: 'partly-sunny-outline' as const, color: '#10B981' },
  { title: 'Dinner', icon: 'moon-outline' as const, color: '#10B981' },
  { title: 'Snacks', icon: 'cafe-outline' as const, color: '#10B981' },
];

const extractEdgeFunctionError = async (error: any): Promise<string> => {
  if (!error) return 'An unexpected error occurred.';
  try {
    if (error.context) {
      if (typeof error.context.json === 'function') {
        const body = await error.context.json();
        if (body?.error) return body.error;
        if (body?.message) return body.message;
      }
      if (typeof error.context.text === 'function') {
        const text = await error.context.text();
        if (text) {
          try {
            const parsed = JSON.parse(text);
            if (parsed?.error) return parsed.error;
            if (parsed?.message) return parsed.message;
          } catch (e) {
            return text;
          }
        }
      }
    }
  } catch (e) {}
  return error.message || 'Edge Function returned an error.';
};

/**
 * Resolves the user's preferred greeting name with robust fallback hierarchy:
 * 1. Database profile full_name / display_name
 * 2. OAuth provider metadata (Google full_name, name, given_name + family_name)
 * 3. Locally cached name from previous active session
 * 4. Capitalized email prefix as clean last resort
 */
function resolveUserName(
  profileData?: Partial<Profile> | null,
  userMetadata?: Record<string, any> | null,
  fallbackEmail?: string,
  cachedName?: string | null
): string {
  const dbDisplayName = profileData?.display_name?.trim();
  if (dbDisplayName) return dbDisplayName;

  const dbFullName = profileData?.full_name?.trim();
  if (dbFullName) return dbFullName;

  const metaFullName = userMetadata?.full_name?.trim();
  if (metaFullName) return metaFullName;

  const metaName = userMetadata?.name?.trim();
  if (metaName) return metaName;

  const combinedGivenFamily = `${userMetadata?.given_name || ''} ${userMetadata?.family_name || ''}`.trim();
  if (combinedGivenFamily) return combinedGivenFamily;

  if (cachedName && cachedName.trim() && cachedName.trim() !== 'User') {
    return cachedName.trim();
  }

  if (fallbackEmail && fallbackEmail.includes('@')) {
    const prefix = fallbackEmail.split('@')[0];
    if (prefix) {
      return prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }
  }

  return 'User';
}

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const { showAlert } = useAlert();

  const [userName, setUserName] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [googleAvatarUrl, setGoogleAvatarUrl] = useState<string | null>(null);

  const [dailySummary, setDailySummary] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [todaysEntries, setTodaysEntries] = useState<MealEntry[]>([]);
  const [recentFoods, setRecentFoods] = useState<RecentFood[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [todaysExercises, setTodaysExercises] = useState<ExerciseEntry[]>([]);
  const [todaysWeight, setTodaysWeight] = useState<WeightLog | null>(null);

  // UI Flow State
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [activeMealType, setActiveMealType] = useState<string>('');
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addExerciseVisible, setAddExerciseVisible] = useState(false);
  const [addWeightVisible, setAddWeightVisible] = useState(false);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString());
  const [dayNumber, setDayNumber] = useState<number>(1);
  const [isRefreshingHC, setIsRefreshingHC] = useState(false);
  const [scanningType, setScanningType] = useState<'meal' | 'exercise' | null>(null);
  const [hasImage, setHasImage] = useState(false);
  const [isUploaded, setIsUploaded] = useState(false);
  
  // Review Modal State
  const [estimate, setEstimate] = useState<MealEstimate | null>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MealEntry | null>(null);
  const [editingExercise, setEditingExercise] = useState<ExerciseEntry | null>(null);

  // Adaptive Check-In State
  const [checkInRecommendation, setCheckInRecommendation] = useState<CheckInRecommendation | null>(null);
  const [isCheckInModalVisible, setIsCheckInModalVisible] = useState(false);
  const [isCheckInEligible, setIsCheckInEligible] = useState(false);
  const [daysSinceLastCheckIn, setDaysSinceLastCheckIn] = useState(0);
  const [isCheckInBannerDismissed, setIsCheckInBannerDismissed] = useState(false);
  const [isSavingCheckIn, setIsSavingCheckIn] = useState(false);

  // Repeat Yesterday Multi-Meal State
  const [repeatCandidates, setRepeatCandidates] = useState<RepeatMealCandidate[]>([]);
  const [repeatSelectorVisible, setRepeatSelectorVisible] = useState(false);

  const router = useRouter();
  const {
    steps: hcSteps,
    activeCalories: hcActiveCalories,
    isSupported: hcSupported,
    hasPermission: hcHasPermission,
    syncedDate: hcSyncedDate,
    error: hcError,
    fetchSteps,
  } = useHealthConnect(selectedDate);

  // Refs for spotlight walkthrough
  const rootRef = useRef<View>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const dailySummaryRef = useRef<View>(null);
  const mealSectionsRef = useRef<View>(null);
  const exerciseSectionRef = useRef<View>(null);
  const weightSectionRef = useRef<View>(null);
  const insightsTabRef = useRef<View>(null);

  const walkthroughTargetRefs = useRef({
    dailySummary: dailySummaryRef,
    mealSections: mealSectionsRef,
    exerciseSection: exerciseSectionRef,
    weightSection: weightSectionRef,
    insightsTab: insightsTabRef,
  }).current;

  const fetchDashboardData = useCallback(async (uid: string, dateStr: string, isSilent: boolean = false) => {
    if (!isSilent) {
      setIsDashboardLoading(true);
    }
    try {
      const { startIso, endIso } = getLocalDayBoundsIso(dateStr);

      // 1. Fetch today's meal entries with foods (matching local summary_date or local day bounds)
      const { data: entriesData } = await supabase
        .from('meal_entries')
        .select('*, meal_food(*)')
        .eq('user_id', uid)
        .or(`summary_date.eq.${dateStr},and(created_at.gte.${startIso},created_at.lte.${endIso})`)
        .order('created_at', { ascending: true });

      const loadedEntries = (entriesData as MealEntry[]) || [];
      setTodaysEntries(loadedEntries);

      // 2. Derive Daily Summary directly from loaded meal entries (Single Source of Truth)
      const sumCals = loadedEntries.reduce((s, e) => s + (Number(e.calories) || 0), 0);
      const sumPro = loadedEntries.reduce((s, e) => s + (Number(e.protein) || 0), 0);
      const sumCarbs = loadedEntries.reduce((s, e) => s + (Number(e.carbs) || 0), 0);
      const sumFat = loadedEntries.reduce((s, e) => s + (Number(e.fat) || 0), 0);
      setDailySummary({ calories: sumCals, protein: sumPro, carbs: sumCarbs, fat: sumFat });

      // 3. Fetch recent foods (limit 10)
      const { data: recentsData } = await supabase
        .from('recent_foods')
        .select('*')
        .eq('user_id', uid)
        .order('last_used_at', { ascending: false })
        .limit(10);

      if (recentsData) {
        setRecentFoods(recentsData as RecentFood[]);
      }

      // 4. Fetch today's exercises
      const { data: exercisesData } = await supabase
        .from('exercises')
        .select('*')
        .eq('user_id', uid)
        .eq('exercise_date', dateStr);

      const isFutureDate = dateStr > getLocalDateString();
      if (exercisesData) {
        if (isFutureDate) {
          const ghostEntries = (exercisesData as ExerciseEntry[]).filter(
            e => e.source === ExerciseSource.HEALTH_CONNECT || e.external_id?.startsWith('health_connect_steps_')
          );
          if (ghostEntries.length > 0) {
            supabase
              .from('exercises')
              .delete()
              .eq('user_id', uid)
              .in('id', ghostEntries.map(e => e.id))
              .then(() => {});
          }
          setTodaysExercises(
            (exercisesData as ExerciseEntry[]).filter(
              e => !(e.source === ExerciseSource.HEALTH_CONNECT || e.external_id?.startsWith('health_connect_steps_'))
            )
          );
        } else {
          setTodaysExercises(exercisesData as ExerciseEntry[]);
        }
      } else {
        setTodaysExercises([]);
      }

      // 5. Fetch today's weight
      const { data: weightData } = await supabase
        .from('weight_logs')
        .select('*')
        .eq('user_id', uid)
        .or(`log_date.eq.${dateStr},and(recorded_at.gte.${startIso},recorded_at.lte.${endIso})`)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (weightData) {
        setTodaysWeight(weightData as WeightLog);
      } else {
        setTodaysWeight(null);
      }

      // 6. Check Weekly Check-In Eligibility (7+ days elapsed)
      try {
        const todayStr = getLocalDateString();
        const { data: profRow } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
        const currentProf = profRow as Profile | null;

        if (currentProf) {
          const checkInRefDate = currentProf.last_check_in_date || (currentProf.created_at ? currentProf.created_at.split('T')[0] : null);
          if (checkInRefDate) {
            const daysDiff = Math.floor((new Date(todayStr).getTime() - new Date(checkInRefDate).getTime()) / (1000 * 60 * 60 * 24));
            setDaysSinceLastCheckIn(daysDiff);

            if (daysDiff >= 7) {
              setIsCheckInEligible(true);
              const sevenDaysAgo = new Date();
              sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
              const sevenDaysAgoStr = getLocalDateString(sevenDaysAgo);

              const [weightsRes, summariesRes] = await Promise.all([
                supabase
                  .from('weight_logs')
                  .select('weight, log_date')
                  .eq('user_id', uid)
                  .gte('log_date', sevenDaysAgoStr)
                  .order('log_date', { ascending: true }),
                supabase
                  .from('daily_summaries')
                  .select('summary_date, total_calories')
                  .eq('user_id', uid)
                  .gte('summary_date', sevenDaysAgoStr),
              ]);

              const recentWeights = weightsRes.data || [];
              const recentSummaries = summariesRes.data || [];

              if (recentWeights.length > 0 || weightData) {
                const allWeights = [...recentWeights];
                if (weightData && !allWeights.some(w => w.log_date === (weightData as any).log_date)) {
                  allWeights.push({ weight: (weightData as any).weight, log_date: (weightData as any).log_date || todayStr });
                }
                const rec = evaluateWeeklyCheckIn({
                  profile: currentProf,
                  weightLogs: allWeights,
                  dailySummaries: recentSummaries,
                });
                setCheckInRecommendation(rec);
              } else {
                setCheckInRecommendation(null);
              }
            } else {
              setIsCheckInEligible(false);
              setCheckInRecommendation(null);
            }
          }
        }
      } catch (checkInErr) {
        console.warn('Check-in check error:', checkInErr);
      }
    } catch (err) {
      console.error("fetchDashboardData error:", err);
    } finally {
      if (!isSilent) {
        setIsDashboardLoading(false);
      }
    }
  }, []);

  // Initial load on mount (Authentication and Profile)
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        // 1. Instant session check from local storage (eliminates idle wake lag / network delays)
        const { data: { session } } = await supabase.auth.getSession();
        let currentUser = session?.user;

        // Immediately populate cached user name and email from local storage so there's zero UI flash
        if (currentUser?.id) {
          if (isMounted) {
            setUserId(currentUser.id);
            setUserEmail(currentUser.email || '');
          }
          const cachedName = await AsyncStorage.getItem(`cached_user_name_${currentUser.id}`);
          if (cachedName && isMounted) {
            setUserName(cachedName);
          }
        }

        // 2. Validate/refresh user with getUser()
        try {
          const { data: userData, error: authError } = await supabase.auth.getUser();
          if (userData?.user) {
            currentUser = userData.user;
          } else if (authError && !currentUser) {
            console.warn("Auth check failed or session expired:", authError);
            await supabase.auth.signOut();
            if (isMounted) setIsDashboardLoading(false);
            return;
          }
        } catch (authErr) {
          console.warn("getUser network error, using local session user:", authErr);
        }

        if (!currentUser) {
          if (isMounted) setIsDashboardLoading(false);
          return;
        }

        if (isMounted) {
          setUserEmail(currentUser.email || '');
          setUserId(currentUser.id);
        }

        const avatarUrl = currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || null;
        if (avatarUrl && isMounted) {
          setGoogleAvatarUrl(avatarUrl);
        }

        const actualName = (
          currentUser.user_metadata?.full_name ||
          currentUser.user_metadata?.name ||
          `${currentUser.user_metadata?.given_name || ''} ${currentUser.user_metadata?.family_name || ''}`.trim()
        );

        // 3. Fetch profile with resilience against idle reconnections
        let profileData: Profile | null = null;
        try {
          const { data, error: profileErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .maybeSingle();

          if (!profileErr && data) {
            profileData = data as Profile;
          }
        } catch (fetchErr) {
          console.warn("Profile fetch error (offline or network wake):", fetchErr);
        }

        // 4. Ensure profile row exists or sync updated name
        if (!profileData) {
          try {
            const { data: upsertedProfile } = await supabase
              .from('profiles')
              .upsert(
                { id: currentUser.id, full_name: actualName || null },
                { onConflict: 'id' }
              )
              .select()
              .maybeSingle();
            if (upsertedProfile) profileData = upsertedProfile as Profile;
          } catch (upsertErr) {
            console.warn("Profile upsert error:", upsertErr);
          }
        } else if (actualName && profileData.full_name !== actualName) {
          // Only sync OAuth name if user has not set a custom display_name
          if (!profileData.display_name) {
            try {
              const { data: updatedProfile } = await supabase
                .from('profiles')
                .update({ full_name: actualName })
                .eq('id', currentUser.id)
                .select()
                .maybeSingle();
              if (updatedProfile) profileData = updatedProfile as Profile;
            } catch (updateErr) {
              console.warn("Profile name sync error:", updateErr);
            }
          }
        }

        // 5. Resolve user greeting name and persist to local cache
        const cachedName = await AsyncStorage.getItem(`cached_user_name_${currentUser.id}`);
        const finalName = resolveUserName(
          profileData,
          currentUser.user_metadata,
          currentUser.email,
          cachedName
        );

        if (isMounted) {
          setUserName(finalName);
          if (profileData) {
            setProfile(profileData);
          }
        }

        if (finalName && finalName !== 'User') {
          await AsyncStorage.setItem(`cached_user_name_${currentUser.id}`, finalName);
        }

        let needsOnboarding = false;
        if (profileData && !profileData.target_calories) {
          if (isMounted) setShowOnboarding(true);
          needsOnboarding = true;
        }

        // Calculate Day Number
        const accountCreatedAt = currentUser.created_at || profileData?.created_at;
        if (accountCreatedAt && isMounted) {
          const start = new Date(accountCreatedAt);
          start.setHours(0,0,0,0);
          const current = new Date(selectedDate);
          current.setHours(0,0,0,0);
          const diffTime = current.getTime() - start.getTime();
          const dayNum = Math.max(1, Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1);
          setDayNumber(dayNum);
        }

        // Check if we should show walkthrough
        if (!needsOnboarding) {
          const hasSeenWalkthrough = await AsyncStorage.getItem('has_seen_walkthrough');
          if (!hasSeenWalkthrough && isMounted) {
            setShowWalkthrough(true);
          }
        }

        initCatalog(supabase);
        fetchDashboardData(currentUser.id, selectedDate);
      } catch (e) {
        console.error("Init dashboard error:", e);
        if (isMounted) setIsDashboardLoading(false);
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, [fetchDashboardData]);

  // Handle date changes without re-authenticating
  useEffect(() => {
    if (!userId) return;
    setIsDashboardLoading(true);
    const accountCreatedAt = profile?.created_at;
    if (accountCreatedAt) {
      const start = new Date(accountCreatedAt);
      start.setHours(0,0,0,0);
      const current = new Date(selectedDate);
      current.setHours(0,0,0,0);
      const diffTime = current.getTime() - start.getTime();
      const dayNum = Math.max(1, Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1);
      setDayNumber(dayNum);
    }
    fetchDashboardData(userId, selectedDate);
  }, [selectedDate, userId, fetchDashboardData]);

  // Listen for AppState changes (e.g. app waking up after being idle in background)
  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        // 1. Check if date rolled over to a new day while idle
        const todayStr = getLocalDateString();
        if (selectedDate !== todayStr && selectedDate < todayStr) {
          setSelectedDate(todayStr);
        }

        // 2. Silently refresh profile & user name if missing or needed
        if (userId) {
          try {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', userId)
              .maybeSingle();

            if (profileData) {
              setProfile(profileData as Profile);
              const cached = await AsyncStorage.getItem(`cached_user_name_${userId}`);
              const name = resolveUserName(profileData as Profile, null, userEmail, cached);
              if (name && name !== 'User') {
                setUserName(name);
                await AsyncStorage.setItem(`cached_user_name_${userId}`, name);
              }
            }
          } catch (e) {
            console.warn("Background resume profile refresh error:", e);
          }
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [userId, selectedDate, userEmail]);

  // Only re-fetch profile/goals when returning from Settings after explicitly saving new goals
  useFocusEffect(
    useCallback(() => {
      const checkPendingRefresh = async () => {
        try {
          // Immediately apply cached name & avatar for zero-flicker UI updates
          if (userId) {
            const cachedName = await AsyncStorage.getItem(`cached_user_name_${userId}`);
            if (cachedName && cachedName.trim() && cachedName.trim() !== 'User') {
              setUserName(cachedName.trim());
            }
            const cachedAvatar = await AsyncStorage.getItem(`cached_user_avatar_${userId}`);
            if (cachedAvatar) {
              setProfile((prev) => (prev ? { ...prev, avatar_id: cachedAvatar } : prev));
            }
          }

          const shouldRefresh = await AsyncStorage.getItem('should_refresh_home_goals');
          if (shouldRefresh === 'true') {
            await AsyncStorage.removeItem('should_refresh_home_goals');
            if (userId) {
              const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

              if (profileData) {
                setProfile(profileData as Profile);
                const cached = await AsyncStorage.getItem(`cached_user_name_${userId}`);
                const name = resolveUserName(profileData as Profile, null, userEmail, cached);
                setUserName(name);
                if (name && name !== 'User') {
                  await AsyncStorage.setItem(`cached_user_name_${userId}`, name);
                }
              }
              fetchDashboardData(userId, selectedDate, true);
            }
          }
        } catch (e) {
          console.error("Focus refresh check error:", e);
        }
      };
      checkPendingRefresh();
    }, [userId, selectedDate, userEmail, fetchDashboardData])
  );

  // Sync Health Connect steps to database
  useEffect(() => {
    const syncStepsToDB = async () => {
      const todayStr = getLocalDateString();
      if (
        !userId ||
        !hcSupported ||
        hcHasPermission === false ||
        hcSteps === null ||
        hcSteps <= 0 ||
        !profile ||
        hcSyncedDate !== selectedDate ||
        selectedDate > todayStr
      ) {
        return;
      }
      
      const syncDate = selectedDate;
      const strideCm = profile.stride_length_cm || ((profile.height_cm || 170) * 0.414);
      const distanceKm = hcSteps * (strideCm / 100) / 1000;
      
      let burned = 0;
      let calcMethod = CalculationMethod.HEALTH_PLATFORM;

      if (hcActiveCalories && hcActiveCalories > 0) {
        burned = hcActiveCalories;
      } else {
        calcMethod = CalculationMethod.STEP_DISTANCE_ESTIMATE;
        const durationMins = (distanceKm / 4.5) * 60;
        const weight = profile.weight_kg || 70;
        burned = durationMins * ((3.5 - 1) * 3.5 * weight) / 200;
      }

      const externalId = `health_connect_steps_${syncDate}`;
      const stepEntry = {
        user_id: userId,
        exercise_date: syncDate,
        exercise_type: 'Steps',
        description: `≈ ${distanceKm.toFixed(1)} km`,
        duration_minutes: 0,
        steps_count: hcSteps,
        calories_burned: Math.round(burned),
        source: ExerciseSource.HEALTH_CONNECT,
        calculation_method: calcMethod,
        external_id: externalId,
      };

      const { data, error } = await supabase
        .from('exercises')
        .upsert(stepEntry, { onConflict: 'user_id,external_id' })
        .select()
        .single();

      if (data && !error) {
        setTodaysExercises(prev => {
          const filtered = prev.filter(e => e.external_id !== externalId && (e.exercise_type !== 'Steps' || e.exercise_date !== syncDate));
          return [...filtered, data as ExerciseEntry];
        });
      }
    };

    const timeoutId = setTimeout(() => {
      syncStepsToDB();
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [hcSteps, hcActiveCalories, userId, profile, selectedDate, hcSyncedDate, hcHasPermission, hcSupported]);

  const handleRefreshHC = () => {
    if (isRefreshingHC) return;
    setIsRefreshingHC(true);
    fetchSteps();
    // 15 seconds cooldown
    setTimeout(() => {
      setIsRefreshingHC(false);
    }, 15000);
  };

  const handleStepsPress = () => {
    const todayStr = getLocalDateString();
    if (selectedDate > todayStr) {
      showAlert(
        'Future Date',
        'Step count and active calorie tracking will become available on this day.'
      );
      return;
    }

    if (!hcSupported) {
      showAlert(
        'Health Connect Unavailable',
        'Health Connect is only available on supported Android devices.'
      );
      return;
    }

    if (hcHasPermission === false) {
      fetchSteps(true);
      return;
    }

    handleRefreshHC();
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) showAlert('Sign Out Error', error.message);
  };

  const handleSaveProfile = async (profileData: Partial<Profile>) => {
    if (!userId) return;
    const startingWeight = profileData.weight_kg ?? profile?.starting_weight_kg;
    const { data, error } = await supabase
      .from('profiles')
      .upsert(
        { 
          ...profileData, 
          starting_weight_kg: startingWeight,
          id: userId, 
          updated_at: new Date().toISOString() 
        },
        { onConflict: 'id' }
      )
      .select()
      .single();
      
    if (error) {
      showAlert('Error saving profile', error.message);
      return;
    }
    
    setProfile(data as Profile);
    setShowOnboarding(false);

    // Record initial starting weight in weight_logs so historical charts start with this baseline
    if (profileData.weight_kg) {
      const todayDate = getLocalDateString();
      await supabase
        .from('weight_logs')
        .upsert(
          {
            user_id: userId,
            weight: profileData.weight_kg,
            log_date: todayDate,
            recorded_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,log_date' }
        );
    }
    
    // Check walkthrough after onboarding completes
    const hasSeenWalkthrough = await AsyncStorage.getItem('has_seen_walkthrough');
    if (!hasSeenWalkthrough) {
      setTimeout(() => setShowWalkthrough(true), 500);
    }
  };

  const handleSkipOnboarding = async () => {
    if (!userId) return;
    const defaultProfile = {
      goal: 'Just track my food',
      activity_level: 'Sedentary',
      maintenance_calories: 2000,
      under_eating_threshold: 1500,
      target_calories: 2000,
      target_protein: 150,
      target_carbs: 200,
      target_fat: 65,
      target_steps: 5000,
    };
    await handleSaveProfile(defaultProfile);
    showAlert('Targets Set', 'We assigned default targets. You can edit them anytime in your profile.');
  };


  const handleAnalyzeExercise = async (text: string) => {
    setScanningType('exercise');
    try {
      const weight = profile?.weight_kg || 70;
      const idempotencyKey = Crypto.randomUUID();
      const { data, error } = await supabase.functions.invoke('log-exercise', {
        body: { text, weight, idempotency_key: idempotencyKey }
      });
      if (error) {
        const errorMsg = await extractEdgeFunctionError(error);
        throw new Error(errorMsg);
      }
      if (data?.error) {
        const isDaily = data?.is_daily_limit || data.error.includes('daily limit') || data.error.includes('add your own API key');
        if (isDaily) {
          showAlert(
            'Daily Limit Reached',
            data.error,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Settings', onPress: () => router.push('/settings') }
            ]
          );
          return null;
        }
        throw new Error(data.error);
      }
      return data.data;
    } catch (err: any) {
      const isDaily = err.message?.includes('daily limit') || err.message?.includes('add your own API key');
      if (isDaily) {
        showAlert(
          'Daily Limit Reached',
          err.message,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Settings', onPress: () => router.push('/settings') }
          ]
        );
      } else {
        showAlert('Analysis Failed', err.message || 'Could not analyze exercise.');
      }
      throw err;
    } finally {
      setScanningType(null);
    }
  };

  const handleLogExercise = async (entryData: any, desc: string) => {
    if (!userId) return;
    
    try {
      const clientExerciseId = Crypto.randomUUID();
      const exerciseDate = selectedDate || getLocalDateString();
      const { data, error } = await supabase
        .from('exercises')
        .insert({
          id: clientExerciseId,
          user_id: userId,
          title: entryData.title,
          exercise_type: entryData.exercise_type,
          description: desc,
          duration_minutes: entryData.duration_minutes,
          steps_count: 0,
          calories_burned: Math.round(entryData.calories_burned || 0),
          source: ExerciseSource.MANUAL,
          calculation_method: CalculationMethod.MET,
          exercise_date: exerciseDate,
        })
        .select()
        .single();
        
      if (error) throw error;
      
      setTodaysExercises(prev => [...prev, data as ExerciseEntry]);
    } catch (err: any) {
      showAlert('Log Failed', err.message);
    }
  };

  const handleUpdateExercise = async (exerciseId: string, entryData: any, desc: string) => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('exercises')
        .update({
          title: entryData.title,
          exercise_type: entryData.exercise_type,
          description: desc,
          duration_minutes: entryData.duration_minutes,
          calories_burned: Math.round(entryData.calories_burned || 0),
        })
        .eq('id', exerciseId)
        .select()
        .single();

      if (error) throw error;

      setTodaysExercises(prev => prev.map(e => (e.id === exerciseId ? (data as ExerciseEntry) : e)));
    } catch (err: any) {
      showAlert('Update Failed', err.message);
    }
  };

  const handleDeleteExercise = async (entry: ExerciseEntry) => {
    setTodaysExercises(prev => prev.filter(e => e.id !== entry.id));
    try {
      const { error } = await supabase.from('exercises').delete().eq('id', entry.id);
      if (error) throw error;
    } catch (err: any) {
      showAlert('Delete Failed', err.message);
      if (userId) fetchDashboardData(userId, selectedDate);
    }
  };

  const handleLogWeight = async (weight: number) => {
    if (!userId) return;
    try {
      const todayDate = selectedDate || getLocalDateString();

      // If user had an earlier starting weight and is logging today, ensure the starting weight
      // was preserved on their account creation date in weight_logs:
      const priorWeight = profile?.starting_weight_kg ?? profile?.weight_kg;
      const accountCreatedDate = profile?.created_at ? profile.created_at.split('T')[0] : null;
      if (priorWeight && accountCreatedDate && accountCreatedDate < todayDate) {
        const { count } = await supabase
          .from('weight_logs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .lt('log_date', todayDate);

        if (count === 0) {
          await supabase
            .from('weight_logs')
            .upsert(
              {
                user_id: userId,
                weight: priorWeight,
                log_date: accountCreatedDate,
                recorded_at: profile?.created_at || new Date().toISOString(),
              },
              { onConflict: 'user_id,log_date' }
            );
        }
      }

      const { data, error } = await supabase
        .from('weight_logs')
        .upsert(
          {
            user_id: userId,
            weight,
            log_date: todayDate,
            recorded_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,log_date' }
        )
        .select()
        .single();

      if (error) throw error;
      setTodaysWeight(data as WeightLog);
      
      // Update profile weight
      await supabase.from('profiles').update({ weight_kg: weight }).eq('id', userId);
      setProfile(prev => prev ? { ...prev, weight_kg: weight } : null);

      // Check if weekly check-in is due (7+ days since last check-in or creation)
      const currentProf = profile ? { ...profile, weight_kg: weight } : null;
      const checkInRefDate = currentProf?.last_check_in_date || (currentProf?.created_at ? currentProf.created_at.split('T')[0] : null);
      if (currentProf && checkInRefDate) {
        const daysDiff = Math.floor((new Date(todayDate).getTime() - new Date(checkInRefDate).getTime()) / (1000 * 60 * 60 * 24));
        setDaysSinceLastCheckIn(daysDiff);

        if (daysDiff >= 7) {
          setIsCheckInEligible(true);
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const sevenDaysAgoStr = getLocalDateString(sevenDaysAgo);

          const [recentWeightsRes, recentSummariesRes] = await Promise.all([
            supabase
              .from('weight_logs')
              .select('weight, log_date')
              .eq('user_id', userId)
              .gte('log_date', sevenDaysAgoStr)
              .order('log_date', { ascending: true }),
            supabase
              .from('daily_summaries')
              .select('summary_date, total_calories')
              .eq('user_id', userId)
              .gte('summary_date', sevenDaysAgoStr),
          ]);

          const recentWeights = recentWeightsRes.data || [];
          if (!recentWeights.some(w => w.log_date === todayDate)) {
            recentWeights.push({ weight, log_date: todayDate });
          }

          const rec = evaluateWeeklyCheckIn({
            profile: currentProf,
            weightLogs: recentWeights,
            dailySummaries: recentSummariesRes.data || [],
          });
          setCheckInRecommendation(rec);

          // Prompt the user to review targets
          setTimeout(() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showAlert(
              '🎯 Weekly Check-In Ready!',
              '7 days have elapsed since your last check-in. Review your weight trend and calibrate your calorie & macro targets now?',
              [
                { text: 'Later', style: 'cancel' },
                {
                  text: 'Review Targets',
                  onPress: () => setIsCheckInModalVisible(true),
                },
              ]
            );
          }, 350);
        }
      }
    } catch (err: any) {
      showAlert('Error logging weight', err.message);
    }
  };

  const handleAcceptCheckIn = async () => {
    if (!userId || !checkInRecommendation) return;
    setIsSavingCheckIn(true);
    try {
      const todayDate = getLocalDateString();
      const rec = checkInRecommendation;

      // 1. Insert into check_ins table
      const { error: checkInError } = await supabase.from('check_ins').insert({
        user_id: userId,
        check_in_date: todayDate,
        scale_weight: rec.currentScaleWeight,
        trend_weight: rec.currentTrendWeight,
        previous_trend_weight: rec.previousTrendWeight,
        weight_delta_kg: rec.weightDeltaKg,
        rate_percent: rec.ratePercent,
        days_logged: rec.daysLogged,
        status: 'accepted',
        action_type: rec.actionType,
        old_calories: rec.oldCalories,
        new_calories: rec.newCalories,
        old_protein: rec.oldProtein,
        new_protein: rec.newProtein,
        old_carbs: rec.oldCarbs,
        new_carbs: rec.newCarbs,
        old_fat: rec.oldFat,
        new_fat: rec.newFat,
        coach_message: rec.rationale,
      });

      if (checkInError) throw checkInError;

      // 2. Update profile with new targets, last_check_in_date, and trend_weight_kg
      const updatedProfileFields = {
        target_calories: rec.newCalories,
        target_protein: rec.newProtein,
        target_carbs: rec.newCarbs,
        target_fat: rec.newFat,
        protein_multiplier: rec.proteinMultiplier,
        calibrated_weight_kg: rec.calibratedWeightKg || rec.currentScaleWeight,
        last_check_in_date: todayDate,
        trend_weight_kg: rec.currentTrendWeight,
      };

      const { error: profileError } = await supabase
        .from('profiles')
        .update(updatedProfileFields)
        .eq('id', userId);

      if (profileError) throw profileError;

      // 3. Update local state
      setProfile(prev => prev ? { ...prev, ...updatedProfileFields } : null);
      setIsCheckInModalVisible(false);
      setIsCheckInEligible(false);

      showAlert(
        '🎯 Targets Updated!',
        `Your daily calorie budget is now ${rec.newCalories} kcal with macros recalibrated for your current bodyweight.`
      );
    } catch (err: any) {
      showAlert('Check-In Save Failed', err.message || 'Could not save check-in.');
    } finally {
      setIsSavingCheckIn(false);
    }
  };

  const handleKeepCurrentCheckIn = async () => {
    if (!userId || !checkInRecommendation) return;
    setIsSavingCheckIn(true);
    try {
      const todayDate = getLocalDateString();
      const rec = checkInRecommendation;

      // 1. Insert into check_ins table as kept_current
      await supabase.from('check_ins').insert({
        user_id: userId,
        check_in_date: todayDate,
        scale_weight: rec.currentScaleWeight,
        trend_weight: rec.currentTrendWeight,
        previous_trend_weight: rec.previousTrendWeight,
        weight_delta_kg: rec.weightDeltaKg,
        rate_percent: rec.ratePercent,
        days_logged: rec.daysLogged,
        status: 'kept_current',
        action_type: rec.actionType,
        old_calories: rec.oldCalories,
        new_calories: rec.oldCalories,
        old_protein: rec.oldProtein,
        new_protein: rec.oldProtein,
        old_carbs: rec.oldCarbs,
        new_carbs: rec.oldCarbs,
        old_fat: rec.oldFat,
        new_fat: rec.oldFat,
        coach_message: 'User opted to keep current targets.',
      });

      // 2. Update profile with last_check_in_date and trend_weight_kg
      const updatedProfileFields = {
        last_check_in_date: todayDate,
        trend_weight_kg: rec.currentTrendWeight,
      };

      await supabase
        .from('profiles')
        .update(updatedProfileFields)
        .eq('id', userId);

      setProfile(prev => prev ? { ...prev, ...updatedProfileFields } : null);
      setIsCheckInModalVisible(false);
      setIsCheckInEligible(false);

      showAlert('Plan Preserved', 'Your current nutrition targets will remain active for the next week.');
    } catch (err: any) {
      showAlert('Error', err.message);
    } finally {
      setIsSavingCheckIn(false);
    }
  };

  const openAddFood = (mealType: string) => {
    const existingEntriesCount = todaysEntries.filter(e => e.meal_type === mealType).length;
    if (existingEntriesCount >= 5) {
      showAlert('Limit Reached', `You have reached the maximum of 5 entries for ${mealType} today.`);
      return;
    }
    setActiveMealType(mealType);
    setAddModalVisible(true);
  };

  // Step 1: Call Gemini (with Binary Upload, Idempotency Key & Real-Time Upload Progress)
  const handleAnalyze = async (text?: string, imageBase64?: string, imageUri?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setScanningType('meal');
    setHasImage(!!imageUri || !!imageBase64);
    setIsUploaded(false);

    try {
      const idempotencyKey = Crypto.randomUUID();
      const data = await invokeScanFoodWithProgress({
        text,
        imageUri,
        imageBase64,
        mealType: activeMealType,
        idempotencyKey,
        onUploadComplete: () => {
          setIsUploaded(true);
        },
      });
      
      if (data?.error) {
        const isSizeError = data.error.includes('too large') || data.error.includes('3MB') || data.error.includes('10MB');
        if (isSizeError) {
          showAlert('Image Too Large', data.error);
          return;
        }

        const isDaily = data?.is_daily_limit || data.error.includes('daily limit') || data.error.includes('add your own API key') || data.error.includes('Daily scan limit');
        if (isDaily) {
          showAlert(
            'Daily Limit Reached',
            data.error,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Settings', onPress: () => router.push('/settings') }
            ]
          );
          return;
        }
        throw new Error(data.error);
      }
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEstimate(data.data as MealEstimate);
      setReviewVisible(true);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const isSizeError = err.message?.includes('too large') || err.message?.includes('3MB') || err.message?.includes('413');
      if (isSizeError) {
        showAlert('Image Too Large', 'The image is too large to analyze. Please choose a smaller photo or retake it.');
        return;
      }
      const isDaily = err.message?.includes('daily limit') || err.message?.includes('add your own API key') || err.message?.includes('Daily scan limit');
      if (isDaily) {
        showAlert(
          'Daily Limit Reached',
          err.message,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Settings', onPress: () => router.push('/settings') }
          ]
        );
      } else {
        showAlert('Analysis Failed', err.message || 'Could not analyze meal.');
      }
    } finally {
      setScanningType(null);
      setHasImage(false);
      setIsUploaded(false);
    }
  };

  // Step 2: Save to DB (with Client-Generated Meal ID)
  const handleSaveMeal = async (mealName: string, title: string, foods: FoodItem[], totals: MealTotals) => {
    setIsSaving(true);
    try {
      const validFoods = foods.filter(f => (f.calories || 0) > 0 && (f.quantity || 0) > 0);
      const totalCals = totals.calories || validFoods.reduce((s, f) => s + f.calories, 0);

      // If no positive-calorie foods remain
      if (validFoods.length === 0 || totalCals <= 0) {
        if (editingEntry) {
          await handleDeleteEntry(editingEntry);
        }
        setReviewVisible(false);
        setEstimate(null);
        setEditingEntry(null);
        return;
      }

      const clientMealId = editingEntry ? editingEntry.id : Crypto.randomUUID();

      if (editingEntry) {
        // Edit mode: delete old entry + re-insert via log-meal
        const { error: delError } = await supabase.rpc('delete_meal_entry', {
          p_meal_id: editingEntry.id,
        });
        if (delError) throw delError;
      }

      const { data, error } = await supabase.functions.invoke('log-meal', {
        body: {
          meal_id: clientMealId,
          meal_type: activeMealType,
          meal_name: mealName,
          title: title,
          foods: foods,
          totals: totals,
          date: selectedDate,
        }
      });

      if (error) {
        const errorMsg = await extractEdgeFunctionError(error);
        throw new Error(errorMsg);
      }
      if (data?.error) throw new Error(data.error);

      setReviewVisible(false);
      setEstimate(null);
      setEditingEntry(null);
      if (userId) fetchDashboardData(userId, selectedDate, true);
    } catch (err: any) {
      const isSizeError = err.message?.includes('too large') || err.message?.includes('3MB') || err.message?.includes('413');
      if (isSizeError) {
        showAlert('Image Too Large', 'The image is too large to save. Please choose a smaller photo.');
      } else {
        showAlert(
          editingEntry ? 'Update Failed' : 'Save Failed',
          err.message || 'Could not save meal.',
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  const pendingDeletesRef = useRef<Set<string>>(new Set());

  const handleDeleteEntry = async (entry: MealEntry) => {
    // Prevent duplicate triggers for the same entry
    if (pendingDeletesRef.current.has(entry.id)) return;
    pendingDeletesRef.current.add(entry.id);

    // Haptic feedback on delete
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // 1. Optimistic local state update for snappy UI
    setTodaysEntries((prev) => {
      const next = prev.filter(e => e.id !== entry.id);
      const sumCals = next.reduce((s, e) => s + (Number(e.calories) || 0), 0);
      const sumPro = next.reduce((s, e) => s + (Number(e.protein) || 0), 0);
      const sumCarbs = next.reduce((s, e) => s + (Number(e.carbs) || 0), 0);
      const sumFat = next.reduce((s, e) => s + (Number(e.fat) || 0), 0);
      setDailySummary({ calories: sumCals, protein: sumPro, carbs: sumCarbs, fat: sumFat });
      return next;
    });

    try {
      // 2. Atomic delete via Supabase RPC
      const { error } = await supabase.rpc('delete_meal_entry', {
        p_meal_id: entry.id,
      });

      if (error) throw error;
    } catch (err: any) {
      showAlert('Delete Failed', err.message || 'Could not delete entry.');
      // Re-fetch to rollback only on error
      if (userId) fetchDashboardData(userId, selectedDate);
    } finally {
      pendingDeletesRef.current.delete(entry.id);
    }
  };

  /** Opens the review modal pre-populated with the entry's food breakdown. */
  const handleEditEntry = (entry: MealEntry) => {
    // Restore the per-food breakdown from the relational table or fallback to raw_input
    let foods: FoodItem[] = [];
    
    if (entry.meal_food && entry.meal_food.length > 0) {
      foods = entry.meal_food.map(f => ({
        name: f.name,
        quantity: f.quantity,
        unit: f.unit,
        calories: f.calories,
        protein_g: f.protein_g,
        carbs_g: f.carbs_g,
        fat_g: f.fat_g,
      }));
    } else if (entry.raw_input?.foods && entry.raw_input.foods.length > 0) {
      foods = entry.raw_input.foods;
    } else {
      // Fallback: treat the whole entry as one food item
      foods = [{
        name: entry.meal_name,
        quantity: 1,
        unit: 'serving',
        calories: entry.calories,
        protein_g: entry.protein,
        carbs_g: entry.carbs,
        fat_g: entry.fat,
      }];
    }
    setEditingEntry(entry);
    setActiveMealType(entry.meal_type);
    setEstimate({
      meal_name: entry.meal_name,
      foods,
      totals: {
        calories: entry.calories,
        protein_g: entry.protein,
        carbs_g: entry.carbs,
        fat_g: entry.fat,
      },
      confidence: 1.0,
    });
    setReviewVisible(true);
  };

  const handleQuickAdd = async (mealName: string, foods: FoodItem[], totals: MealTotals) => {
    // Show the review modal pre-filled with the recent food data
    setEstimate({
      meal_name: mealName,
      foods: foods,
      totals: totals,
      confidence: 1.0,
    });
    setReviewVisible(true);
  };

  const handleRepeatYesterday = async () => {
    if (!userId) return;
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = getLocalDateString(yesterday);
      const { startIso: yStart, endIso: yEnd } = getLocalDayBoundsIso(yesterdayStr);

      const { data: yesterdayEntries } = await supabase
        .from('meal_entries')
        .select('*, meal_food(*)')
        .eq('user_id', userId)
        .eq('meal_type', activeMealType)
        .gte('created_at', yStart)
        .lte('created_at', yEnd)
        .order('created_at', { ascending: true });

      if (!yesterdayEntries || yesterdayEntries.length === 0) {
        showAlert('No meals found', `You didn't log any ${activeMealType} yesterday.`);
        return;
      }

      // Convert each yesterday entry into a candidate
      const candidates: RepeatMealCandidate[] = yesterdayEntries.map((entry: any) => {
        let parsedFoods: FoodItem[] = [];
        if (entry.meal_food && entry.meal_food.length > 0) {
          parsedFoods = entry.meal_food.map((f: any) => ({
            name: f.name,
            quantity: Number(f.quantity) || 1,
            unit: f.unit || 'serving',
            calories: Number(f.calories) || 0,
            protein_g: Number(f.protein_g) || 0,
            carbs_g: Number(f.carbs_g) || 0,
            fat_g: Number(f.fat_g) || 0,
          }));
        } else {
          try {
            if (entry.raw_input && typeof entry.raw_input === 'object' && Array.isArray((entry.raw_input as any).foods)) {
              parsedFoods = (entry.raw_input as any).foods.map((f: any) => ({
                name: f.name || 'Item',
                quantity: Number(f.quantity) || 1,
                unit: f.unit || 'serving',
                calories: Number(f.calories) || 0,
                protein_g: Number(f.protein_g) || 0,
                carbs_g: Number(f.carbs_g) || 0,
                fat_g: Number(f.fat_g) || 0,
              }));
            }
          } catch(e) {}
        }

        if (parsedFoods.length === 0) {
          parsedFoods = [{
            name: entry.title || entry.meal_name || 'Item',
            quantity: 1,
            unit: 'serving',
            calories: Number(entry.calories) || 0,
            protein_g: Number(entry.protein) || 0,
            carbs_g: Number(entry.carbs) || 0,
            fat_g: Number(entry.fat) || 0,
          }];
        }

        const mealTitle = (entry.title || entry.meal_name || activeMealType).trim();
        let timeStr = '';
        if (entry.created_at) {
          try {
            const d = new Date(entry.created_at);
            if (!isNaN(d.getTime())) {
              timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            }
          } catch(e) {}
        }
        const foodSummary = parsedFoods.map(f => f.name).filter(Boolean).join(', ');

        return {
          id: entry.id,
          meal_name: mealTitle,
          created_at: entry.created_at,
          timeStr,
          calories: Number(entry.calories) || 0,
          protein: Number(entry.protein) || 0,
          carbs: Number(entry.carbs) || 0,
          fat: Number(entry.fat) || 0,
          foods: parsedFoods,
          foodSummary,
        };
      });

      // If only 1 meal was logged yesterday, bypass selector and open review directly with exact title
      if (candidates.length === 1) {
        const single = candidates[0];
        setEstimate({
          meal_name: single.meal_name,
          title: single.meal_name,
          foods: single.foods,
          totals: {
            calories: single.calories,
            protein_g: single.protein,
            carbs_g: single.carbs,
            fat_g: single.fat,
          },
          confidence: 1.0,
        });
        setReviewVisible(true);
        return;
      }

      // If multiple meals logged yesterday, let user select via modal
      setRepeatCandidates(candidates);
      setRepeatSelectorVisible(true);
    } catch (e) {
      console.error(e);
      showAlert('Error', 'Could not fetch yesterday\'s meals.');
    }
  };

  const handleConfirmRepeatMeals = (selected: RepeatMealCandidate[]) => {
    setRepeatSelectorVisible(false);
    if (!selected || selected.length === 0) return;

    // Smart Concatenation:
    // If 1 meal selected: keep that exact title.
    // If multiple meals: join names with " + ". Fall back to `${activeMealType} Combo` if > 32 chars.
    let finalTitle: string;
    if (selected.length === 1) {
      finalTitle = selected[0].meal_name;
    } else {
      const names = selected.map(s => s.meal_name.trim()).filter(Boolean);
      const joined = names.join(' + ');
      finalTitle = joined.length > 0 && joined.length <= 32 ? joined : `${activeMealType} Combo`;
    }

    const combinedFoods = selected.flatMap(s => s.foods);
    const combinedTotals: MealTotals = selected.reduce(
      (acc, s) => ({
        calories: acc.calories + s.calories,
        protein_g: Math.round((acc.protein_g + s.protein) * 10) / 10,
        carbs_g: Math.round((acc.carbs_g + s.carbs) * 10) / 10,
        fat_g: Math.round((acc.fat_g + s.fat) * 10) / 10,
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );

    setEstimate({
      meal_name: finalTitle,
      title: finalTitle,
      foods: combinedFoods,
      totals: combinedTotals,
      confidence: 1.0,
    });
    setReviewVisible(true);
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const isFutureDate = selectedDate > getLocalDateString();

  const hcStepsEntry = hcSupported ? (() => {
    if (hcHasPermission === false) {
      return {
        id: 'health-connect-steps',
        user_id: userId || '',
        exercise_date: selectedDate,
        exercise_type: 'Steps',
        description: 'Tap to connect',
        duration_minutes: 0,
        steps_count: -1,
        calories_burned: 0,
        created_at: new Date().toISOString(),
        source: ExerciseSource.HEALTH_CONNECT,
        calculation_method: CalculationMethod.HEALTH_PLATFORM,
      } as ExerciseEntry;
    }

    if (isFutureDate) {
      return {
        id: 'health-connect-steps',
        user_id: userId || '',
        exercise_date: selectedDate,
        exercise_type: 'Steps',
        description: '≈ 0.0 km',
        duration_minutes: 0,
        steps_count: 0,
        calories_burned: 0,
        created_at: new Date().toISOString(),
        source: ExerciseSource.HEALTH_CONNECT,
        calculation_method: CalculationMethod.HEALTH_PLATFORM,
      } as ExerciseEntry;
    }

    if (hcSteps === null || hcSyncedDate !== selectedDate) {
      const cached = todaysExercises.find(e => e.exercise_type === 'Steps' && e.exercise_date === selectedDate);
      if (cached) return cached;
      return null;
    }

    const strideCm = profile?.stride_length_cm || ((profile?.height_cm || 170) * 0.414);
    const distanceKm = hcSteps * (strideCm / 100) / 1000;
    
    let burned = 0;
    let calcMethod = CalculationMethod.HEALTH_PLATFORM;

    if (hcActiveCalories && hcActiveCalories > 0) {
      burned = hcActiveCalories;
    } else {
      calcMethod = CalculationMethod.STEP_DISTANCE_ESTIMATE;
      const durationMins = (distanceKm / 4.5) * 60;
      const weight = profile?.weight_kg || 70;
      burned = durationMins * ((3.5 - 1) * 3.5 * weight) / 200;
    }

    return {
      id: 'health-connect-steps',
      user_id: userId || '',
      exercise_date: selectedDate,
      exercise_type: 'Steps',
      description: `≈ ${distanceKm.toFixed(1)} km`,
      duration_minutes: 0,
      steps_count: hcSteps,
      calories_burned: Math.round(burned),
      created_at: new Date().toISOString(),
      source: ExerciseSource.HEALTH_CONNECT,
      calculation_method: calcMethod,
    } as ExerciseEntry;
  })() : todaysExercises.find(e => e.exercise_type === 'Steps' && e.exercise_date === selectedDate) || null;

  const displayExercises = [
    ...(hcStepsEntry ? [hcStepsEntry] : []),
    ...todaysExercises.filter(e => e.exercise_type !== 'Steps' && e.exercise_date === selectedDate)
  ];

  const totalBurnedCalories = displayExercises.reduce((sum, e) => sum + (e.calories_burned || 0), 0);
  const activityCreditFactor = profile?.activity_credit_factor ?? 0.70;
  const activityCredit = totalBurnedCalories * activityCreditFactor;

  const targetCals = profile?.target_calories ? profile.target_calories + activityCredit : undefined;
  const targetCarbs = profile?.target_carbs ? profile.target_carbs + (activityCredit / 4) : undefined;

  // Alert user when activity bonus is earned on the home page (only once per date when credit > 0)
  // Ensures instructional tips/walkthrough finishes first before showing this alert!
  useEffect(() => {
    let alertTimer: ReturnType<typeof setTimeout> | null = null;

    const checkActivityCreditAlert = async () => {
      // Don't show alert while dashboard is still loading, or while walkthrough/onboarding is active
      if (isDashboardLoading || showWalkthrough || showOnboarding) {
        return;
      }

      // Instructional tips must be completed first before showing active calories burned alert
      const hasSeenWalkthrough = await AsyncStorage.getItem('has_seen_walkthrough');
      if (!hasSeenWalkthrough) {
        return;
      }

      const credit = Math.round(activityCredit);
      const burned = Math.round(totalBurnedCalories);

      if (credit > 0 && burned > 0 && profile?.target_calories) {
        const key = `has_seen_activity_credit_${selectedDate}`;
        const hasSeen = await AsyncStorage.getItem(key);
        if (!hasSeen) {
          await AsyncStorage.setItem(key, 'true');
          const baseCals = Math.round(profile.target_calories);
          const newTarget = Math.round(baseCals + credit);
          const pct = Math.round(activityCreditFactor * 100);

          // Small delay so walkthrough modal completely dismisses before the alert presents
          alertTimer = setTimeout(() => {
            showAlert(
              '⚡ Activity Bonus Added!',
              `You burned ${burned} kcal through exercise today!\n\nYour target budget increased by +${credit} kcal (${pct}% credit) from ${baseCals} to ${newTarget} kcal to fuel your activity.`
            );
          }, 400);
        }
      }
    };

    checkActivityCreditAlert();

    return () => {
      if (alertTimer) {
        clearTimeout(alertTimer);
      }
    };
  }, [
    isDashboardLoading,
    showWalkthrough,
    showOnboarding,
    activityCredit,
    totalBurnedCalories,
    profile?.target_calories,
    selectedDate,
    activityCreditFactor,
  ]);

  return (
    <SafeAreaView ref={rootRef} style={[styles.container, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      
      <ScrollView
        ref={scrollViewRef}
        scrollEnabled={!showWalkthrough}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: isDark ? '#94A3B8' : '#64748B' }]}>{greeting()} 👋</Text>
            <Text style={[styles.name, { color: textPrimary }]}>{userName}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              style={[styles.profileButton, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}
              onPress={() => router.push('/settings')}
              accessibilityRole="button"
              accessibilityLabel="Profile settings"
            >
              <UserAvatar
                avatarId={profile?.avatar_id}
                googleAvatarUrl={googleAvatarUrl}
                fallbackInitial={(userName.trim()[0] || 'U').toUpperCase()}
                size={40}
              />
            </Pressable>
            <Pressable style={[styles.profileButton, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]} onPress={handleSignOut}>
              <Ionicons name="log-out-outline" size={22} color={isDark ? '#94A3B8' : '#64748B'} />
            </Pressable>
          </View>
        </View>
        
        <View style={styles.headerRow}>
          <Text style={[styles.dateText, { color: textPrimary }]}>
            {(() => {
              const todayDate = new Date();
              const todayStr = getLocalDateString(todayDate);
              const yesterday = new Date(todayDate);
              yesterday.setDate(yesterday.getDate() - 1);
              const yesterdayStr = getLocalDateString(yesterday);
              const tomorrow = new Date(todayDate);
              tomorrow.setDate(tomorrow.getDate() + 1);
              const tomorrowStr = getLocalDateString(tomorrow);
              
              const [y, m, d] = selectedDate.split('-').map(Number);
              const selectedDateObj = new Date(y, m - 1, d);
              const formattedDate = selectedDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              
              if (selectedDate === todayStr) return `Today, ${formattedDate}`;
              if (selectedDate === yesterdayStr) return `Yesterday, ${formattedDate}`;
              if (selectedDate === tomorrowStr) return `Tomorrow, ${formattedDate}`;
              
              return selectedDateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            })()}
          </Text>
          <View style={styles.headerIcons}>
            {hcSupported && selectedDate === getLocalDateString() && (
              <Pressable
                style={[styles.dateBadge, isRefreshingHC && { opacity: 0.5 }]}
                onPress={handleRefreshHC}
                disabled={isRefreshingHC}
              >
                <Ionicons name="sync" size={14} color={isDark ? '#94A3B8' : '#64748B'} />
              </Pressable>
            )}
            <Pressable style={styles.dateBadge} onPress={() => setCalendarVisible(true)}>
              <Ionicons name="calendar-outline" size={14} color={isDark ? '#94A3B8' : '#64748B'} />
              <Text style={[styles.dayBadgeText, { color: isDark ? '#94A3B8' : '#64748B' }]}>DAY {dayNumber}</Text>
            </Pressable>
          </View>
        </View>

        <View ref={dailySummaryRef} collapsable={false}>
          <DailySummaryCard
            date={selectedDate}
            calories={dailySummary.calories}
            protein={dailySummary.protein}
            carbs={dailySummary.carbs}
            fat={dailySummary.fat}
            targetCalories={targetCals}
            baseTargetCalories={profile?.target_calories}
            activityCredit={activityCredit}
            maintenanceCalories={profile?.maintenance_calories}
            targetProtein={profile?.target_protein}
            targetCarbs={targetCarbs}
            targetFat={profile?.target_fat}
            burnedCalories={totalBurnedCalories}
            underEatingThreshold={profile?.under_eating_threshold}
            isLoading={isDashboardLoading}
          />
        </View>

        {isCheckInEligible && !isCheckInBannerDismissed && (
          <CheckInBanner
            hasRecentWeight={!!checkInRecommendation}
            daysSinceLastCheckIn={daysSinceLastCheckIn}
            isFirstCheckIn={!profile?.last_check_in_date}
            onReviewPress={() => setIsCheckInModalVisible(true)}
            onLogWeightPress={() => setAddWeightVisible(true)}
            onDismiss={() => setIsCheckInBannerDismissed(true)}
          />
        )}

        <View ref={mealSectionsRef} collapsable={false}>
          {MEAL_TYPES.map((meal) => (
            <MealSection
              key={meal.title}
              title={meal.title}
              icon={meal.icon}
              color={meal.color}
              entries={todaysEntries.filter(e => e.meal_type === meal.title)}
              onAddPress={() => openAddFood(meal.title)}
              onDeleteEntry={handleDeleteEntry}
              onEditEntry={handleEditEntry}
            />
          ))}
        </View>

        <View ref={exerciseSectionRef} collapsable={false}>
          <ExerciseSection
            entries={displayExercises}
            onAddPress={() => {
              setEditingExercise(null);
              setAddExerciseVisible(true);
            }}
            onEditExercise={(entry) => {
              setEditingExercise(entry);
              setAddExerciseVisible(true);
            }}
            onDeleteEntry={handleDeleteExercise}
            onStepsPress={handleStepsPress}
          />
        </View>

        <View ref={weightSectionRef} collapsable={false}>
          <WeightSection
            latestLog={todaysWeight}
            onAddPress={() => setAddWeightVisible(true)}
          />
        </View>

        <View style={styles.accountInfo}>
          <Text style={[styles.accountEmail, { color: isDark ? '#475569' : '#CBD5E1' }]}>
            Signed in as {userEmail}
          </Text>
        </View>
      </ScrollView>

      <AddFoodModal
        visible={addModalVisible}
        mealType={activeMealType}
        recentFoods={recentFoods}
        onClose={() => setAddModalVisible(false)}
        onAnalyze={handleAnalyze}
        onQuickAdd={handleQuickAdd}
        onRepeatYesterday={handleRepeatYesterday}
      />

      <AddExerciseModal
        visible={addExerciseVisible}
        onClose={() => {
          setAddExerciseVisible(false);
          setEditingExercise(null);
        }}
        onAnalyzeExercise={handleAnalyzeExercise}
        onLogExercise={handleLogExercise}
        onUpdateExercise={handleUpdateExercise}
        editingExercise={editingExercise}
        userWeightKg={profile?.weight_kg || 70}
      />

      <LogWeightModal
        visible={addWeightVisible}
        initialWeight={todaysWeight?.weight ?? profile?.weight_kg}
        isEditing={!!todaysWeight}
        onClose={() => setAddWeightVisible(false)}
        onLogWeight={handleLogWeight}
      />

      <WeeklyCheckInModal
        visible={isCheckInModalVisible}
        recommendation={checkInRecommendation}
        onClose={() => setIsCheckInModalVisible(false)}
        onAccept={handleAcceptCheckIn}
        onKeepCurrent={handleKeepCurrentCheckIn}
        isSaving={isSavingCheckIn}
      />

      <RepeatMealSelectorModal
        visible={repeatSelectorVisible}
        mealType={activeMealType}
        candidates={repeatCandidates}
        onClose={() => setRepeatSelectorVisible(false)}
        onConfirm={handleConfirmRepeatMeals}
      />

      <MealReviewModal
        visible={reviewVisible}
        mealType={activeMealType}
        estimate={estimate}
        isEditMode={!!editingEntry}
        onSave={handleSaveMeal}
        onClose={() => {
          setReviewVisible(false);
          setEditingEntry(null);
          setEstimate(null);
        }}
        isSaving={isSaving}
      />
      <OnboardingModal
        visible={showOnboarding}
        onSave={handleSaveProfile}
        onSkip={() => {
          setShowOnboarding(false);
          AsyncStorage.getItem('has_seen_walkthrough').then((hasSeen) => {
            if (!hasSeen) {
              setTimeout(() => setShowWalkthrough(true), 500);
            }
          });
        }}
      />

      <CalendarModal
        visible={calendarVisible}
        selectedDate={selectedDate}
        userId={userId}
        onClose={() => setCalendarVisible(false)}
        onSelectDate={(dateStr) => {
          if (dateStr !== selectedDate) {
            setIsDashboardLoading(true);
            setSelectedDate(dateStr);
          }
          setCalendarVisible(false);
        }}
      />

      <SpotlightWalkthrough
        visible={showWalkthrough}
        onComplete={async () => {
          await AsyncStorage.setItem('has_seen_walkthrough', 'true');
          setShowWalkthrough(false);
        }}
        targetRefs={walkthroughTargetRefs}
        scrollViewRef={scrollViewRef}
        rootRef={rootRef}
        scrollOffsetRef={scrollOffsetRef}
      />

      {scanningType && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', justifyContent: 'center', zIndex: 1000 }]}>
          <ScanningLoader type={scanningType} hasImage={hasImage} isUploaded={isUploaded} />
        </View>
      )}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  dateText: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 12,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  dayBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  greeting: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  accountInfo: {
    alignItems: 'center',
    paddingTop: 8,
    marginTop: 20,
  },
  accountEmail: {
    fontSize: 12,
  },
});
