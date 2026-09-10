import React from 'react';
import { View, Text, StyleSheet, Pressable, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CheckInBannerProps {
  hasRecentWeight: boolean;
  daysSinceLastCheckIn: number;
  isFirstCheckIn: boolean;
  onReviewPress: () => void;
  onLogWeightPress: () => void;
  onDismiss?: () => void;
}

export function CheckInBanner({
  hasRecentWeight,
  daysSinceLastCheckIn,
  isFirstCheckIn,
  onReviewPress,
  onLogWeightPress,
  onDismiss,
}: CheckInBannerProps) {
  const isDark = useColorScheme() === 'dark';

  return (
    <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
      <View style={styles.topRow}>
        <View style={styles.badgeContainer}>
          <View style={styles.sparkleIcon}>
            <Ionicons name="sparkles" size={12} color="#6366F1" />
          </View>
          <Text style={styles.badgeText}>
            {isFirstCheckIn ? 'FIRST WEEKLY CHECK-IN' : 'ADAPTIVE COACH'}
          </Text>
        </View>

        {onDismiss && (
          <Pressable onPress={onDismiss} hitSlop={8} style={styles.dismissButton}>
            <Ionicons name="close" size={16} color={isDark ? '#64748B' : '#94A3B8'} />
          </Pressable>
        )}
      </View>

      <View style={styles.contentRow}>
        <View style={[styles.iconBox, { backgroundColor: hasRecentWeight ? (isDark ? '#1E1B4B' : '#EEF2FF') : (isDark ? '#312E81' : '#F5F3FF') }]}>
          <Ionicons
            name={hasRecentWeight ? 'analytics-outline' : 'scale-outline'}
            size={24}
            color={hasRecentWeight ? '#6366F1' : '#8B5CF6'}
          />
        </View>

        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
            {hasRecentWeight
              ? 'Weekly Check-In Ready!'
              : 'Weekly Check-In Due'}
          </Text>
          <Text style={[styles.description, { color: isDark ? '#94A3B8' : '#64748B' }]}>
            {hasRecentWeight
              ? 'Your 7-day progress is ready for review. Check out your updated calorie & macro targets.'
              : 'Log your body weight today so your coach can smooth your trend and calibrate targets.'}
          </Text>
        </View>
      </View>

      <View style={styles.footerRow}>
        {hasRecentWeight ? (
          <Pressable
            style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.85 }]}
            onPress={onReviewPress}
          >
            <Text style={styles.actionButtonText}>Review Targets</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.actionButtonSecondary, { borderColor: isDark ? '#4F46E5' : '#6366F1' }, pressed && { opacity: 0.85 }]}
            onPress={onLogWeightPress}
          >
            <Ionicons name="add-circle-outline" size={16} color={isDark ? '#818CF8' : '#6366F1'} style={{ marginRight: 6 }} />
            <Text style={[styles.actionButtonSecondaryText, { color: isDark ? '#818CF8' : '#6366F1' }]}>Log Weight to Check In</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  sparkleIcon: {
    marginRight: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6366F1',
    letterSpacing: 0.5,
  },
  dismissButton: {
    padding: 2,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  actionButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  actionButtonSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
