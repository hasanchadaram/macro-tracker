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
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, withSequence } from 'react-native-reanimated';
import type { Profile } from '@/lib/types';

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
  const [hasSeenTips, setHasSeenTips] = useState(true);
  const [aiSettings, setAiSettings] = useState({ byok_enabled: true, has_custom_key: false });
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [onboardingInitialStep, setOnboardingInitialStep] = useState<'intro' | 'review'>('intro');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const appVersion = Constants.expoConfig?.version || '1.0.0';

  const pulseAnim = useSharedValue(1);

  useEffect(() => {
    fetchAiSettings();
    loadTipsState();
    fetchProfile();
  }, []);

  useEffect(() => {
    if (!hasSeenTips) {
      pulseAnim.value = withRepeat(
        withSequence(
          withTiming(1.2, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      pulseAnim.value = 1;
    }
  }, [hasSeenTips]);

  const loadTipsState = async () => {
    try {
      const value = await AsyncStorage.getItem('has_seen_tips');
      setHasSeenTips(value === 'true');
    } catch (e) {}
  };

  const handleOpenTips = async () => {
    setTipsVisible(true);
    if (!hasSeenTips) {
      setHasSeenTips(true);
      await AsyncStorage.setItem('has_seen_tips', 'true');
    }
  };

  const glowingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (user.email) {
        setUserEmail(user.email);
      }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (data) {
        setCurrentProfile(data as Profile);
      }
    } catch (e) {
      console.log('Error fetching profile:', e);
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

  // Profile Header Card details
  const userName = currentProfile?.full_name || currentProfile?.display_name || (userEmail ? userEmail.split('@')[0] : 'User');
  const userInitial = (userName.trim()[0] || 'U').toUpperCase();

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
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>{userInitial}</Text>
          </View>
          <View style={styles.profileDetails}>
            <Text style={[styles.profileName, { color: textPrimary }]} numberOfLines={1}>
              {userName}
            </Text>
            {userEmail ? (
              <Text style={[styles.profileEmail, { color: textSecondary }]} numberOfLines={1}>
                {userEmail}
              </Text>
            ) : null}
            {currentProfile?.goal ? (
              <View style={styles.profileGoalBadge}>
                <Ionicons name="trophy-outline" size={13} color="#6366F1" />
                <Text style={styles.profileGoalText}>{currentProfile.goal}</Text>
              </View>
            ) : null}
          </View>
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
          </View>
        </View>

        {/* 2. AI FEATURES */}
        {aiSettings.byok_enabled && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textSecondary }]}>AI FEATURES</Text>
            
            <View style={[styles.card, { backgroundColor: bgSurface, borderColor }]}>
              <Pressable 
                style={styles.listItem}
                onPress={() => setByokVisible(true)}
              >
                <View style={styles.listItemLeft}>
                  <View style={[styles.iconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                    <Ionicons name="key-outline" size={20} color="#10B981" />
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
                  {!hasSeenTips ? (
                    <Animated.View style={glowingStyle}>
                      <Ionicons name="bulb" size={20} color="#EAB308" />
                    </Animated.View>
                  ) : (
                    <Ionicons name="bulb-outline" size={20} color="#EAB308" />
                  )}
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
            Day Fuel v{appVersion}
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
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 24,
    gap: 16,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  profileAvatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileDetails: {
    flex: 1,
    gap: 3,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
  },
  profileEmail: {
    fontSize: 13,
  },
  profileGoalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 5,
    marginTop: 4,
  },
  profileGoalText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6366F1',
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
