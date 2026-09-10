import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { WeightLog } from '@/lib/types';

interface WeightSectionProps {
  latestLog: WeightLog | null;
  onAddPress: () => void;
}

export function WeightSection({ latestLog, onAddPress }: WeightSectionProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const activeColor = '#8B5CF6'; // Purple
  const borderColor = isDark ? '#334155' : '#E2E8F0';

  return (
    <View style={[styles.container, { backgroundColor: cardBg, borderColor }]}>
      {/* Consistent Header matching Meal/Exercise sections */}
      <Pressable style={styles.header} onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onAddPress();
      }}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconWrap, { backgroundColor: activeColor + '18' }]}>
            <Ionicons name="scale-outline" size={20} color={activeColor} />
          </View>
          <Text style={[styles.title, { color: textPrimary }]}>WEIGHT</Text>
        </View>
        <View style={[styles.addButton, { backgroundColor: activeColor + '18' }]}>
          <Ionicons name={latestLog ? "pencil" : "add"} size={latestLog ? 16 : 20} color={activeColor} />
        </View>
      </Pressable>

      {/* Customized Content specific to Weight widget */}
      <View style={styles.content}>
        {latestLog ? (
          <Pressable
            style={({ pressed }) => [styles.logContainer, pressed && { opacity: 0.8 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onAddPress();
            }}
          >
            <View style={styles.logLeft}>
              <Text style={[styles.weightText, { color: textPrimary }]}>
                {latestLog.weight} <Text style={[styles.unitText, { color: textSecondary }]}>kg</Text>
              </Text>
              <Text style={[styles.timeText, { color: textSecondary }]}>
                Logged today at {new Date(latestLog.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <View style={styles.logRight}>
              <View style={[styles.editPill, { backgroundColor: activeColor + '18' }]}>
                <Ionicons name="pencil" size={13} color={activeColor} style={{ marginRight: 4 }} />
                <Text style={[styles.editPillText, { color: activeColor }]}>Update</Text>
              </View>
              <View style={styles.successBadge}>
                <Ionicons name="checkmark-circle" size={24} color="#10B981" />
              </View>
            </View>
          </Pressable>
        ) : (
          <Pressable style={styles.emptyContainer} onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onAddPress();
          }}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="scale-outline" size={24} color={textSecondary} />
            </View>
            <Text style={[styles.emptyText, { color: textSecondary }]}>No weight logged today.</Text>
            <Text style={[styles.emptySubText, { color: activeColor }]}>Tap to log</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    marginTop: 16,
  },
  logContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  logLeft: {
    gap: 4,
  },
  logRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  editPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  weightText: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  unitText: {
    fontSize: 18,
    fontWeight: '600',
  },
  timeText: {
    fontSize: 13,
    fontWeight: '500',
  },
  successBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#10B98115',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(150, 150, 150, 0.05)',
  },
  emptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 4,
  },
  emptySubText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
