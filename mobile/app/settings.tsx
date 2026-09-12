import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAlert } from '@/components/ui/CustomAlert';
import { OnboardingModal } from '@/components/OnboardingModal';
import { BYOKModal } from '@/components/BYOKModal';
import { TipsModal } from '@/components/TipsModal';
import { FeedbackModal } from '@/components/FeedbackModal';
import { WeeklyCheckInModal } from '@/components/WeeklyCheckInModal';
import UserAvatar from '@/components/UserAvatar';
import AvatarPickerModal from '@/components/AvatarPickerModal';
import EditNameModal from '@/components/EditNameModal';
import { AttentionBeacon } from '@/components/ui/AttentionBeacon';
import { getAvatarById } from '@/constants/avatars';
import { evaluateWeeklyCheckIn } from '@/lib/nutrition';
import { getLocalDateString } from '@/lib/dateUtils';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, withSequence } from 'react-native-reanimated';
import type { Profile, CheckInRecommendation } from '@/lib/types';
import { checkForAppUpdate, openPlayStore } from '@/lib/versionUtils';

export default function ProfileScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { showAlert } = useAlert();
  
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const bgSurface = isDark ? '#1E293B' : '#FFFFFF';
  const borderColor = isDark ? '#334155' : '#E2E8F0';

  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [byokVisible, setByokVisible] = useState(false);
  const [tipsVisible, setTipsVisible] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [editNameVisible, setEditNameVisible] = useState(false);
  const [avatarPickerVisible, setAvatarPickerVisible] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const [googleAvatarUrl, setGoogleAvatarUrl] = useState<string | null>(null);
  const [hasSeenTips, setHasSeenTips] = useState(true);
  const [hasSeenByok, setHasSeenByok] = useState(true);
  const [aiSettings, setAiSettings] = useState({ byok_enabled: true, has_custom_key: false });
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [onboardingInitialStep, setOnboardingInitialStep] = useState<'intro' | 'review'>('intro');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  
  // Adaptive Check-In State
  const [checkInRec, setCheckInRec] = useState<CheckInRecommendation | null>(null);
  const [checkInModalVisible, setCheckInModalVisible] = useState(false);
  const [isEvaluatingCheckIn, setIsEvaluatingCheckIn] = useState(false);
  const [isSavingCheckIn, setIsSavingCheckIn] = useState(false);
  const [isCheckInReadOnly, setIsCheckInReadOnly] = useState(false);

  const appVersion = Constants.expoConfig?.version || '1.1.2';
  const appVersionCode = Constants.expoConfig?.android?.versionCode || 10;
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  const handleCheckForUpdates = async () => {
    if (isCheckingUpdate) return;
    setIsCheckingUpdate(true);
    await Haptics.selectionAsync();

    try {
      const result = await checkForAppUpdate();

      if (!result.success) {
        showAlert(
          'Update Check Failed',
          'Could not check for updates right now. Please verify your internet connection and try again.'
        );
        return;
      }

      if (result.hasUpdate && result.latestVersion) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const buildInfo = result.latestVersionCode ? ` (Build ${result.latestVersionCode})` : '';
        const currentBuildInfo = result.currentVersionCode ? ` (Build ${result.currentVersionCode})` : '';
        const notes = result.releaseNotes ? `\n\nWhat's New:\n${result.releaseNotes}` : '';

        showAlert(
          'Update Available! 🚀',
          `A new version of Day Fuel is available!\n\n• Current: v${result.currentVersion}${currentBuildInfo}\n• Latest: v${result.latestVersion}${buildInfo}${notes}`,
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Update from Play Store',
              onPress: () => openPlayStore(result.playStoreUrl),
            },
          ]
        );
      } else {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        showAlert(
          "You're Up to Date! ✨",
          `You are running the latest version of Day Fuel (v${result.currentVersion}, Build ${result.currentVersionCode}).`
        );
      }
    } catch (e: any) {
      showAlert('Update Check Failed', e.message || 'An unexpected error occurred.');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  useEffect(() => {
    hydrateProfileFromCache();
    fetchAiSettings();
    loadTipsState();
    loadByokState();
    fetchProfile();
  }, []);

  const hydrateProfileFromCache = async () => {
    try {
      const cached = await AsyncStorage.getItem('cached_profile_payload');
      if (cached) {
        const parsed = JSON.parse(cached);
        setCurrentProfile(parsed);
        setIsProfileLoading(false);
      }
      const cachedEmail = await AsyncStorage.getItem('cached_user_email');
      if (cachedEmail) {
        setUserEmail(cachedEmail);
      }
      const cachedGoogleAvatar = await AsyncStorage.getItem('cached_google_avatar_url');
      if (cachedGoogleAvatar) {
        setGoogleAvatarUrl(cachedGoogleAvatar);
      }
    } catch (e) {}
  };

  const loadTipsState = async () => {
    try {
      const value = await AsyncStorage.getItem('has_seen_tips');
      setHasSeenTips(value === 'true');
    } catch (e) {}
  };

  const loadByokState = async () => {
    try {
      const value = await AsyncStorage.getItem('has_seen_byok');
      setHasSeenByok(value === 'true');
    } catch (e) {}
  };

  const handleOpenTips = async () => {
    setTipsVisible(true);
    if (!hasSeenTips) {
      setHasSeenTips(true);
      await AsyncStorage.setItem('has_seen_tips', 'true');
    }
  };

  const handleOpenByok = async () => {
    setByokVisible(true);
    if (!hasSeenByok) {
      setHasSeenByok(true);
      await AsyncStorage.setItem('has_seen_byok', 'true');
    }
  };

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (user.email) {
        setUserEmail(user.email);
        AsyncStorage.setItem('cached_user_email', user.email).catch(() => {});
      }
      const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;
      if (avatarUrl) {
        setGoogleAvatarUrl(avatarUrl);
        AsyncStorage.setItem('cached_google_avatar_url', avatarUrl).catch(() => {});
      }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (data) {
        setCurrentProfile(data as Profile);
        AsyncStorage.setItem('cached_profile_payload', JSON.stringify(data)).catch(() => {});
      }
    } catch (e) {
      console.log('Error fetching profile:', e);
    } finally {
      setIsProfileLoading(false);
    }
  };

  const handleSaveName = async (newName: string) => {
    try {
      setIsSavingName(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const trimmed = newName.trim();
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: trimmed, full_name: trimmed })
        .eq('id', user.id);

      if (error) throw error;

      await AsyncStorage.setItem(`cached_user_name_${user.id}`, trimmed);
      setCurrentProfile((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, display_name: trimmed, full_name: trimmed };
        AsyncStorage.setItem('cached_profile_payload', JSON.stringify(updated)).catch(() => {});
        return updated;
      });
      setEditNameVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      showAlert('Error', err?.message || 'Failed to update name');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSelectAvatar = async (avatarId: string) => {
    try {
      setIsSavingAvatar(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({ avatar_id: avatarId })
        .eq('id', user.id);

      if (error) throw error;

      await AsyncStorage.setItem(`cached_user_avatar_${user.id}`, avatarId);
      setCurrentProfile((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, avatar_id: avatarId };
        AsyncStorage.setItem('cached_profile_payload', JSON.stringify(updated)).catch(() => {});
        return updated;
      });
      setAvatarPickerVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      showAlert('Error', err?.message || 'Failed to update avatar');
    } finally {
      setIsSavingAvatar(false);
    }
  };

  const fetchAiSettings = async () => {
    try {
      const { data, error } = await supabase.rpc('get_ai_settings');
      if (!error && data) {
        setAiSettings(data);
      }
    } catch (err) {
      console.log('Error fetching AI settings:', err);
    }
  };

  const handleRunAdaptiveCheckIn = async () => {
    try {
      setIsEvaluatingCheckIn(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (!prof) return;

      const todayStr = getLocalDateString();
      const checkInRefDate = prof.last_check_in_date;

      // Check if mid-cycle (< 7 days since last check-in)
      if (checkInRefDate) {
        const daysDiff = Math.floor((new Date(todayStr).getTime() - new Date(checkInRefDate).getTime()) / (1000 * 60 * 60 * 24));

        if (daysDiff < 7) {
          setIsEvaluatingCheckIn(false);
          const daysRemaining = 7 - daysDiff;
          const nextCheckInDate = new Date();
          nextCheckInDate.setDate(nextCheckInDate.getDate() + daysRemaining);
          const nextCheckInDateStr = nextCheckInDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });

          const [y, m, d] = checkInRefDate.split('-').map(Number);
          const lastDateFormatted = new Date(y, m - 1, d).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });

          // Fetch previous check-in record if available
          const { data: lastRecord } = await supabase
            .from('check_ins')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const buttons: { text: string; style?: 'cancel' | 'default'; onPress?: () => void }[] = [
            { text: 'Got It', style: 'cancel' }
          ];

          if (lastRecord) {
            buttons.unshift({
              text: 'View Last Check-In',
              onPress: () => {
                // Parse exact delta and rate from coach_message if not directly stored in columns
                let parsedDelta: number | null = null;
                let parsedRate: number | null = null;
                if (lastRecord.coach_message) {
                  const match = lastRecord.coach_message.match(/(?:gained|dropped by|lost)?\s*([+-]?\d+(?:\.\d+)?)\s*kg\s*\(([+-]?\d+(?:\.\d+)?)\%?/i);
                  if (match) {
                    const dVal = parseFloat(match[1]);
                    const rVal = parseFloat(match[2]);
                    if (!isNaN(dVal)) parsedDelta = dVal;
                    if (!isNaN(rVal)) parsedRate = rVal;
                  }
                }

                const prevWeight = Number(lastRecord.previous_trend_weight) || (prof.weight_kg || 70);
                const currTrend = Number(lastRecord.trend_weight) || (prof.weight_kg || 70);
                const fallbackDelta = Math.round((currTrend - prevWeight) * 100) / 100;
                const fallbackRate = prevWeight > 0 ? Math.round(((currTrend - prevWeight) / prevWeight) * 10000) / 100 : 0;

                const finalDelta = lastRecord.weight_delta_kg !== null && lastRecord.weight_delta_kg !== undefined
                  ? Number(lastRecord.weight_delta_kg)
                  : (parsedDelta ?? fallbackDelta);

                const finalRate = lastRecord.rate_percent !== null && lastRecord.rate_percent !== undefined
                  ? Number(lastRecord.rate_percent)
                  : (parsedRate ?? fallbackRate);

                const rec: CheckInRecommendation = {
                  actionType: lastRecord.action_type || 'hold',
                  title: 'Previous Check-In Summary',
                  verdict: lastRecord.action_type === 'hold' 
                    ? 'On Track & Targets Maintained' 
                    : lastRecord.action_type === 'increase'
                      ? 'Fuel Boost Applied'
                      : lastRecord.action_type === 'decrease' || lastRecord.action_type === 'proactive_trim'
                        ? 'Pacing Adjustment Applied'
                        : 'Targets Updated',
                  rationale: lastRecord.coach_message || 'Your previous check-in targets were evaluated and saved.',
                  isFirstCheckIn: false,
                  daysLogged: lastRecord.days_logged,
                  adherenceMet: (lastRecord.days_logged || 0) >= 5,
                  currentScaleWeight: Number(lastRecord.scale_weight) || (prof.weight_kg || 70),
                  currentTrendWeight: currTrend,
                  previousTrendWeight: prevWeight,
                  weightDeltaKg: finalDelta,
                  ratePercent: finalRate,
                  oldCalories: lastRecord.old_calories,
                  newCalories: lastRecord.new_calories,
                  calorieDelta: (lastRecord.new_calories || 0) - (lastRecord.old_calories || 0),
                  oldMaintenance: Number(prof.maintenance_calories) || (Number(lastRecord.old_calories) || 2000),
                  newMaintenance: Number(prof.maintenance_calories) || (Number(lastRecord.new_calories) || 2000),
                  oldProtein: lastRecord.old_protein,
                  newProtein: lastRecord.new_protein,
                  oldCarbs: lastRecord.old_carbs,
                  newCarbs: lastRecord.new_carbs,
                  oldFat: lastRecord.old_fat,
                  newFat: lastRecord.new_fat,
                  proteinMultiplier: prof.protein_multiplier || 2.0,
                  calibratedWeightKg: prof.calibrated_weight_kg || Number(lastRecord.scale_weight) || (prof.weight_kg || 70),
                  targetSteps: prof.target_steps || 5000,
                  safetyFloor: 1200,
                  isAtFloor: false,
                };
                setCheckInRec(rec);
                setIsCheckInReadOnly(true);
                setCheckInModalVisible(true);
              },
            });
          }

          showAlert(
            'Weekly Cycle in Progress',
            `Your last check-in was completed on ${lastDateFormatted} (${daysDiff} ${daysDiff === 1 ? 'day' : 'days'} ago).\n\nYour adaptive coach requires a 7-day cycle to separate true metabolic progress from normal daily scale fluctuations.\n\nNext check-in unlocks on ${nextCheckInDateStr} (${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} left).`,
            buttons
          );
          return;
        }
      }

      // If eligible (>= 7 days or first check-in):
      setIsCheckInReadOnly(false);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = getLocalDateString(sevenDaysAgo);

      const [weightsRes, summariesRes] = await Promise.all([
        supabase
          .from('weight_logs')
          .select('weight, log_date')
          .eq('user_id', user.id)
          .gte('log_date', sevenDaysAgoStr)
          .order('log_date', { ascending: true }),
        supabase
          .from('daily_summaries')
          .select('summary_date, total_calories')
          .eq('user_id', user.id)
          .gte('summary_date', sevenDaysAgoStr),
      ]);

      const recentWeights = weightsRes.data || [];
      if (recentWeights.length === 0) {
        showAlert(
          'Weight Entry Required',
          'Please log your body weight first so your coach has recent data to smooth your trend and adapt your plan.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Go to Dashboard', onPress: () => router.replace('/(tabs)') }
          ]
        );
        return;
      }

      const rec = evaluateWeeklyCheckIn({
        profile: prof as Profile,
        weightLogs: recentWeights,
        dailySummaries: summariesRes.data || [],
      });

      setCheckInRec(rec);
      setCheckInModalVisible(true);
    } catch (err: any) {
      showAlert('Check-In Failed', err.message);
    } finally {
      setIsEvaluatingCheckIn(false);
    }
  };

  const handleAcceptCheckIn = async () => {
    if (!checkInRec) return;
    setIsSavingCheckIn(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const todayDate = getLocalDateString();
      const rec = checkInRec;

      await supabase.from('check_ins').insert({
        user_id: user.id,
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

      const updatedFields = {
        target_calories: rec.newCalories,
        maintenance_calories: rec.newMaintenance,
        target_protein: rec.newProtein,
        target_carbs: rec.newCarbs,
        target_fat: rec.newFat,
        protein_multiplier: rec.proteinMultiplier,
        calibrated_weight_kg: rec.calibratedWeightKg || rec.currentScaleWeight,
        last_check_in_date: todayDate,
        trend_weight_kg: rec.currentTrendWeight,
        updated_at: new Date().toISOString(),
      };

      await supabase.from('profiles').update(updatedFields).eq('id', user.id);
      await AsyncStorage.setItem('should_refresh_home_goals', 'true');

      if (currentProfile) {
        setCurrentProfile({ ...currentProfile, ...updatedFields });
      }

      setCheckInModalVisible(false);
    } catch (err: any) {
      showAlert('Error', err.message);
    } finally {
      setIsSavingCheckIn(false);
    }
  };

  const handleKeepCurrentCheckIn = async () => {
    if (!checkInRec) return;
    setIsSavingCheckIn(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const todayDate = getLocalDateString();
      const rec = checkInRec;

      await supabase.from('check_ins').insert({
        user_id: user.id,
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

      const updatedFields = {
        last_check_in_date: todayDate,
        trend_weight_kg: rec.currentTrendWeight,
        updated_at: new Date().toISOString(),
      };

      await supabase.from('profiles').update(updatedFields).eq('id', user.id);
      await AsyncStorage.setItem('should_refresh_home_goals', 'true');

      if (currentProfile) {
        setCurrentProfile({ ...currentProfile, ...updatedFields });
      }

      setCheckInModalVisible(false);
    } catch (err: any) {
      showAlert('Error', err.message);
    } finally {
      setIsSavingCheckIn(false);
    }
  };

  const handleSaveOnboarding = async (profileData: Partial<Profile>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { error } = await supabase
        .from('profiles')
        .upsert(
          { ...profileData, id: user.id, updated_at: new Date().toISOString() },
          { onConflict: 'id' }
        );
        
      if (error) throw error;
      
      await AsyncStorage.setItem('should_refresh_home_goals', 'true');
      setOnboardingVisible(false);
      router.replace('/(tabs)');
    } catch (e: any) {
      showAlert('Error', e.message);
    }
  };

  const handleSignOutPrompt = () => {
    showAlert('Log Out', 'Are you sure you want to log out of Day Fuel?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.auth.signOut();
          } catch (e: any) {
            showAlert('Error', e.message || 'Could not sign out');
          }
        },
      },
    ]);
  };

  const handleDeleteAccountPrompt = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    showAlert(
      'Delete Account Permanently?',
      'Warning: This action will permanently erase your entire account and all associated data, including your meals, calories, weight logs, exercise tracking, and personal settings.\n\nThis cannot be undone. Are you sure you want to proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: executeAccountDeletion,
        },
      ]
    );
  };

  const executeAccountDeletion = async () => {
    setIsDeletingAccount(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;

      // 1. Call Supabase RPC to delete user account and associated rows
      const { error } = await supabase.rpc('delete_user_account');
      if (error) throw error;

      // 2. Wipe all local device storage & cache
      if (userId) {
        await AsyncStorage.removeItem(`cached_user_name_${userId}`);
      }
      await AsyncStorage.multiRemove([
        'has_seen_walkthrough',
        'has_seen_add_food_tip',
        'has_seen_swipe_delete_tip',
        'has_seen_swipe_delete_tip_home',
        'has_seen_tips',
        'should_refresh_home_goals',
      ]);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // 3. Sign out of Supabase auth session to trigger root redirect to Login
      await supabase.auth.signOut();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showAlert('Account Deletion Failed', err.message || 'Could not delete your account. Please try again later.');
      setIsDeletingAccount(false);
    }
  };

  // Profile Header Card details - display_name takes highest priority
  const userName = currentProfile?.display_name || currentProfile?.full_name || (userEmail ? userEmail.split('@')[0] : 'User');
  const userInitial = (userName.trim()[0] || 'U').toUpperCase();
  const activeAvatarOption = getAvatarById(currentProfile?.avatar_id);
  const themeColor = activeAvatarOption.themeColor || '#6366F1';

  // Helper to format goal cleanly for display below email
  const getFormattedGoal = (goalStr?: string | null) => {
    if (!goalStr) return 'Maintain Weight';
    const g = goalStr.trim();
    if (/lose/i.test(g)) return 'Lose Weight';
    if (/gain muscle|muscle/i.test(g)) return 'Gain Muscle';
    if (/gain/i.test(g)) return 'Gain Weight';
    if (/maintain/i.test(g)) return 'Maintain Weight';
    if (/track/i.test(g)) return 'Track Food';
    return g;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* User Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: bgSurface, borderColor }]}>
          {isProfileLoading && !currentProfile ? (
            <View style={styles.profileTopRow}>
              <View style={[styles.skeletonAvatar, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]} />
              <View style={[styles.profileDetails, { gap: 6 }]}>
                <View style={[styles.skeletonLine, { width: 140, height: 16, backgroundColor: isDark ? '#334155' : '#E2E8F0' }]} />
                <View style={[styles.skeletonLine, { width: 170, height: 12, backgroundColor: isDark ? '#334155' : '#E2E8F0' }]} />
                <View style={[styles.skeletonLine, { width: 110, height: 22, borderRadius: 8, marginTop: 2, backgroundColor: isDark ? '#334155' : '#E2E8F0' }]} />
              </View>
            </View>
          ) : (
            <View style={styles.profileTopRow}>
              <Pressable
                onPress={() => setAvatarPickerVisible(true)}
                style={({ pressed }) => [
                  styles.avatarWrapper,
                  { opacity: pressed ? 0.85 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Change profile avatar"
              >
                <UserAvatar
                  avatarId={currentProfile?.avatar_id}
                  googleAvatarUrl={googleAvatarUrl}
                  fallbackInitial={userInitial}
                  size={64}
                  showEditBadge
                />
              </Pressable>

              <View style={styles.profileDetails}>
                <View style={styles.profileNameRow}>
                  <Text style={[styles.profileName, { color: textPrimary, flex: 1 }]} numberOfLines={1}>
                    {userName}
                  </Text>
                  <Pressable
                    onPress={() => setEditNameVisible(true)}
                    style={({ pressed }) => [
                      styles.editNameButton,
                      {
                        backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)',
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Edit display name"
                  >
                    <Ionicons name="pencil" size={14} color="#6366F1" />
                  </Pressable>
                </View>

                {userEmail ? (
                  <Text style={[styles.profileEmail, { color: textSecondary }]} numberOfLines={1}>
                    {userEmail}
                  </Text>
                ) : null}

                {/* Goal Badge below Email */}
                <Pressable
                  onPress={() => {
                    setOnboardingInitialStep('review');
                    setOnboardingVisible(true);
                  }}
                  style={({ pressed }) => [
                    styles.profileGoalBadge,
                    {
                      backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.08)',
                      borderColor: isDark ? 'rgba(99, 102, 241, 0.28)' : 'rgba(99, 102, 241, 0.18)',
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Edit nutrition goal"
                >
                  <Ionicons name="flag-outline" size={11} color={themeColor} />
                  <Text
                    style={[styles.profileGoalText, { color: textPrimary }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    {getFormattedGoal(currentProfile?.goal)}
                  </Text>
                  <Ionicons name="chevron-forward" size={10} color={textSecondary} />
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {/* 1. NUTRITION & GOALS */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textSecondary }]}>NUTRITION & GOALS</Text>
          
          <View style={[styles.card, { backgroundColor: bgSurface, borderColor }]}>
            <Pressable 
              style={styles.listItem}
              onPress={() => {
                showAlert('Nutrition Goals', 'How would you like to proceed?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Edit Manually', onPress: () => {
                      setOnboardingInitialStep('review');
                      setOnboardingVisible(true);
                  }},
                  { text: 'Take Quiz', onPress: () => {
                      setOnboardingInitialStep('intro');
                      setOnboardingVisible(true);
                  }}
                ]);
              }}
            >
              <View style={styles.listItemLeft}>
                <View style={[styles.iconContainer, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                  <Ionicons name="flame-outline" size={20} color="#6366F1" />
                </View>
                <View style={styles.itemTextContainer}>
                  <Text style={[styles.listItemTitle, { color: textPrimary }]}>Nutrition Goals</Text>
                  <Text style={[styles.listItemSubtitle, { color: textSecondary }]}>Target calories, macros & weight goal</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={textSecondary} />
            </Pressable>

            <View style={[styles.divider, { backgroundColor: borderColor }]} />

            <Pressable 
              style={styles.listItem}
              onPress={handleRunAdaptiveCheckIn}
              disabled={isEvaluatingCheckIn}
            >
              <View style={styles.listItemLeft}>
                <View style={[styles.iconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <Ionicons name="sparkles-outline" size={20} color="#10B981" />
                </View>
                <View style={styles.itemTextContainer}>
                  <Text style={[styles.listItemTitle, { color: textPrimary }]}>Adaptive Nutrition Check-In</Text>
                  <Text style={[styles.listItemSubtitle, { color: textSecondary }]}>
                    {isEvaluatingCheckIn
                      ? 'Analyzing weekly trend...'
                      : (() => {
                          if (!currentProfile?.last_check_in_date) return 'Calibrate targets & review progress';
                          const todayStr = getLocalDateString();
                          const daysDiff = Math.floor((new Date(todayStr).getTime() - new Date(currentProfile.last_check_in_date).getTime()) / (1000 * 60 * 60 * 24));
                          if (daysDiff < 7) {
                            return `Cycle Day ${daysDiff + 1} of 7 • Next in ${7 - daysDiff}d`;
                          }
                          return 'Weekly check-in ready • Tap to review';
                        })()}
                  </Text>
                </View>
              </View>
              {isEvaluatingCheckIn ? (
                <ActivityIndicator size="small" color="#10B981" />
              ) : (
                <Ionicons name="chevron-forward" size={20} color={textSecondary} />
              )}
            </Pressable>
          </View>
        </View>

        {/* 2. AI FEATURES */}
        {aiSettings.byok_enabled && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textSecondary }]}>AI FEATURES</Text>
            
            <View style={[styles.card, { backgroundColor: bgSurface, borderColor }]}>
              <Pressable 
                style={styles.listItem}
                onPress={handleOpenByok}
              >
                <View style={styles.listItemLeft}>
                  <View style={[styles.iconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                    <AttentionBeacon color="#10B981" size={28} active={!aiSettings.has_custom_key && !hasSeenByok}>
                      <Ionicons name="key-outline" size={20} color="#10B981" />
                    </AttentionBeacon>
                  </View>
                  <View style={styles.itemTextContainer}>
                    <Text style={[styles.listItemTitle, { color: textPrimary }]}>Custom API Key</Text>
                    <Text style={[styles.listItemSubtitle, { color: textSecondary }]}>
                      {aiSettings.has_custom_key ? 'Key is configured' : 'Bring your own Gemini key'}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={textSecondary} />
              </Pressable>
            </View>
          </View>
        )}

        {/* 3. HELP & RESOURCES */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textSecondary }]}>HELP & RESOURCES</Text>
          
          <View style={[styles.card, { backgroundColor: bgSurface, borderColor }]}>
            <Pressable 
              style={styles.listItem}
              onPress={handleOpenTips}
            >
              <View style={styles.listItemLeft}>
                <View style={[styles.iconContainer, { backgroundColor: 'rgba(234, 179, 8, 0.15)' }]}>
                  <AttentionBeacon color="#EAB308" size={28} active={!hasSeenTips}>
                    <Ionicons name={!hasSeenTips ? "bulb" : "bulb-outline"} size={20} color="#EAB308" />
                  </AttentionBeacon>
                </View>
                <View style={styles.itemTextContainer}>
                  <Text style={[styles.listItemTitle, { color: textPrimary }]}>Health & Tracking Tips</Text>
                  <Text style={[styles.listItemSubtitle, { color: textSecondary }]}>Best practices for your goals</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={textSecondary} />
            </Pressable>

            <View style={[styles.divider, { backgroundColor: borderColor }]} />

            <Pressable 
              style={styles.listItem}
              onPress={async () => {
                await AsyncStorage.removeItem('has_seen_walkthrough');
                await AsyncStorage.removeItem('has_seen_add_food_tip');
                await AsyncStorage.removeItem('has_seen_swipe_delete_tip');
                await AsyncStorage.removeItem('has_seen_swipe_delete_tip_home');
                router.replace('/(tabs)');
              }}
            >
              <View style={styles.listItemLeft}>
                <View style={[styles.iconContainer, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                  <Ionicons name="compass-outline" size={20} color="#6366F1" />
                </View>
                <View style={styles.itemTextContainer}>
                  <Text style={[styles.listItemTitle, { color: textPrimary }]}>Reset Tutorials & Tips</Text>
                  <Text style={[styles.listItemSubtitle, { color: textSecondary }]}>Replay the tour and tooltip animations</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={textSecondary} />
            </Pressable>

            <View style={[styles.divider, { backgroundColor: borderColor }]} />

            <Pressable 
              style={styles.listItem}
              onPress={handleCheckForUpdates}
              disabled={isCheckingUpdate}
            >
              <View style={styles.listItemLeft}>
                <View style={[styles.iconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  {isCheckingUpdate ? (
                    <ActivityIndicator size="small" color="#10B981" />
                  ) : (
                    <Ionicons name="cloud-download-outline" size={20} color="#10B981" />
                  )}
                </View>
                <View style={styles.itemTextContainer}>
                  <Text style={[styles.listItemTitle, { color: textPrimary }]}>Check for Updates</Text>
                  <Text style={[styles.listItemSubtitle, { color: textSecondary }]}>
                    {isCheckingUpdate
                      ? 'Checking latest release...'
                      : `Version ${appVersion} (Build ${appVersionCode})`}
                  </Text>
                </View>
              </View>
              {isCheckingUpdate ? (
                <ActivityIndicator size="small" color="#10B981" />
              ) : (
                <Ionicons name="chevron-forward" size={20} color={textSecondary} />
              )}
            </Pressable>
          </View>
        </View>

        {/* 4. SUPPORT & FEEDBACK */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textSecondary }]}>SUPPORT & FEEDBACK</Text>
          
          <View style={[styles.card, { backgroundColor: bgSurface, borderColor }]}>
            <Pressable 
              style={styles.listItem}
              onPress={() => setFeedbackVisible(true)}
            >
              <View style={styles.listItemLeft}>
                <View style={[styles.iconContainer, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                  <Ionicons name="chatbox-ellipses-outline" size={20} color="#F59E0B" />
                </View>
                <View style={styles.itemTextContainer}>
                  <Text style={[styles.listItemTitle, { color: textPrimary }]}>Bug, Complaint or Feedback</Text>
                  <Text style={[styles.listItemSubtitle, { color: textSecondary }]}>Report bugs, submit complaints, or share ideas</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={textSecondary} />
            </Pressable>

            <View style={[styles.divider, { backgroundColor: borderColor }]} />

            <Pressable 
              style={styles.listItem}
              onPress={handleCheckForUpdates}
              disabled={isCheckingUpdate}
            >
              <View style={styles.listItemLeft}>
                <View style={[styles.iconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  {isCheckingUpdate ? (
                    <ActivityIndicator size="small" color="#10B981" />
                  ) : (
                    <Ionicons name="cloud-download-outline" size={20} color="#10B981" />
                  )}
                </View>
                <View style={styles.itemTextContainer}>
                  <Text style={[styles.listItemTitle, { color: textPrimary }]}>Check for Updates</Text>
                  <Text style={[styles.listItemSubtitle, { color: textSecondary }]}>
                    {isCheckingUpdate
                      ? 'Checking latest release...'
                      : `Version ${appVersion} (Build ${appVersionCode})`}
                  </Text>
                </View>
              </View>
              {isCheckingUpdate ? (
                <ActivityIndicator size="small" color="#10B981" />
              ) : (
                <Ionicons name="chevron-forward" size={20} color={textSecondary} />
              )}
            </Pressable>
          </View>
        </View>

        {/* 5. ACCOUNT */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textSecondary }]}>ACCOUNT</Text>
          
          <View style={[styles.card, { backgroundColor: bgSurface, borderColor }]}>
            <Pressable 
              style={styles.listItem}
              onPress={handleSignOutPrompt}
              disabled={isDeletingAccount}
            >
              <View style={styles.listItemLeft}>
                <View style={[styles.iconContainer, { backgroundColor: isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(100, 116, 139, 0.12)' }]}>
                  <Ionicons name="log-out-outline" size={20} color={textSecondary} />
                </View>
                <View style={styles.itemTextContainer}>
                  <Text style={[styles.listItemTitle, { color: textPrimary }]}>Log Out</Text>
                  <Text style={[styles.listItemSubtitle, { color: textSecondary }]}>Sign out of your session on this device</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={textSecondary} />
            </Pressable>

            <View style={[styles.divider, { backgroundColor: borderColor }]} />

            <Pressable 
              style={styles.listItem}
              onPress={handleDeleteAccountPrompt}
              disabled={isDeletingAccount}
            >
              <View style={styles.listItemLeft}>
                <View style={[styles.iconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                  {isDeletingAccount ? (
                    <ActivityIndicator size="small" color="#EF4444" />
                  ) : (
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  )}
                </View>
                <View style={styles.itemTextContainer}>
                  <Text style={[styles.listItemTitle, { color: '#EF4444' }]}>
                    {isDeletingAccount ? 'Deleting Account...' : 'Delete Account'}
                  </Text>
                  <Text style={[styles.listItemSubtitle, { color: isDark ? '#F87171' : '#DC2626' }]}>
                    Permanently erase account and all data
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={isDark ? '#F87171' : '#DC2626'} />
            </Pressable>
          </View>
        </View>

        <View style={styles.versionContainer}>
          <Text style={[styles.versionText, { color: textSecondary }]}>
            Day Fuel v{appVersion} (Build {appVersionCode})
          </Text>
        </View>
      </ScrollView>

      <OnboardingModal
        visible={onboardingVisible}
        onSave={handleSaveOnboarding}
        onSkip={() => setOnboardingVisible(false)}
        initialStep={onboardingInitialStep}
        initialProfile={currentProfile}
      />

      <BYOKModal
        visible={byokVisible}
        hasCustomKey={aiSettings.has_custom_key}
        onClose={() => setByokVisible(false)}
        onSaveSuccess={fetchAiSettings}
      />

      <TipsModal 
        visible={tipsVisible} 
        onClose={() => setTipsVisible(false)} 
      />

      <FeedbackModal
        visible={feedbackVisible}
        onClose={() => setFeedbackVisible(false)}
      />

      <WeeklyCheckInModal
        visible={checkInModalVisible}
        recommendation={checkInRec}
        onClose={() => setCheckInModalVisible(false)}
        onAccept={handleAcceptCheckIn}
        onKeepCurrent={handleKeepCurrentCheckIn}
        isSaving={isSavingCheckIn}
        isReadOnly={isCheckInReadOnly}
      />

      <EditNameModal
        visible={editNameVisible}
        initialName={userName}
        onSave={handleSaveName}
        onClose={() => setEditNameVisible(false)}
        isSaving={isSavingName}
      />

      <AvatarPickerModal
        visible={avatarPickerVisible}
        selectedAvatarId={currentProfile?.avatar_id}
        googleAvatarUrl={googleAvatarUrl}
        fallbackInitial={userInitial}
        onSelectAvatar={handleSelectAvatar}
        onClose={() => setAvatarPickerVisible(false)}
        isSaving={isSavingAvatar}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    padding: 16,
  },
  profileCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 20,
  },
  profileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarWrapper: {
    borderRadius: 32,
  },
  skeletonAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  skeletonLine: {
    borderRadius: 6,
  },
  profileAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileDetails: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  editNameButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  profileEmail: {
    fontSize: 13,
    fontWeight: '500',
  },
  profileGoalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    marginTop: 3,
    maxWidth: '100%',
  },
  profileGoalText: {
    fontSize: 11.5,
    fontWeight: '600',
    flexShrink: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    marginLeft: 16,
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  listItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  itemTextContainer: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  listItemSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginLeft: 68,
  },
  versionContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  versionText: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});
