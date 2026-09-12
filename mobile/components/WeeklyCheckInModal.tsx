import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { CheckInRecommendation, CheckInActionType } from '@/lib/types';
import { formatWeight } from '@/lib/nutrition';

interface WeeklyCheckInModalProps {
  visible: boolean;
  recommendation: CheckInRecommendation | null;
  onClose: () => void;
  onAccept: () => void;
  onKeepCurrent: () => void;
  isSaving?: boolean;
  isReadOnly?: boolean;
}

export function WeeklyCheckInModal({
  visible,
  recommendation,
  onClose,
  onAccept,
  onKeepCurrent,
  isSaving = false,
  isReadOnly = false,
}: WeeklyCheckInModalProps) {
  const isDark = useColorScheme() === 'dark';
  const [activeFloorTab, setActiveFloorTab] = useState<'steps' | 'diet_break' | 'audit'>('steps');

  if (!recommendation) return null;

  const {
    actionType,
    title,
    verdict,
    rationale,
    isFirstCheckIn,
    daysLogged,
    adherenceMet,
    currentScaleWeight,
    currentTrendWeight,
    previousTrendWeight,
    weightDeltaKg,
    ratePercent,
    oldCalories,
    newCalories,
    calorieDelta,
    oldMaintenance,
    newMaintenance,
    oldProtein,
    newProtein,
    oldCarbs,
    newCarbs,
    oldFat,
    newFat,
    targetSteps,
    safetyFloor,
  } = recommendation;

  const hasTargetChanges = calorieDelta !== 0;

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const innerCardBg = isDark ? '#0F172A' : '#F8FAFC';

  const getActionBadge = (type: CheckInActionType) => {
    switch (type) {
      case 'hold':
        return { label: 'TARGETS MAINTAINED', bg: 'rgba(16, 185, 129, 0.12)', color: '#10B981', icon: 'checkmark-circle' };
      case 'proactive_trim':
        return { label: 'PROACTIVE PACE TRIM', bg: 'rgba(99, 102, 241, 0.12)', color: '#6366F1', icon: 'flash' };
      case 'decrease':
        return { label: 'DEFICIT ADJUSTMENT', bg: 'rgba(245, 158, 11, 0.12)', color: '#F59E0B', icon: 'trending-down' };
      case 'increase':
        return { label: 'FUEL SURPLUS BOOST', bg: 'rgba(139, 92, 246, 0.12)', color: '#8B5CF6', icon: 'trending-up' };
      case 'floor_reached':
        return { label: 'SAFETY FLOOR LOCKED', bg: 'rgba(239, 68, 68, 0.12)', color: '#EF4444', icon: 'shield-checkmark' };
      case 'adherence_warning':
        return { label: 'CONSISTENCY PRIORITY', bg: 'rgba(249, 115, 22, 0.12)', color: '#F97316', icon: 'alert-circle' };
      default:
        return { label: 'ADAPTIVE COACH', bg: 'rgba(99, 102, 241, 0.12)', color: '#6366F1', icon: 'sparkles' };
    }
  };

  const badge = getActionBadge(actionType);

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {Platform.OS !== 'ios' && (
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        )}
        <View style={[styles.modalContent, { backgroundColor: cardBg }]}>
          {/* Top handle bar */}
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: borderColor }]} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.superTitle, { color: '#6366F1' }]}>
                {isReadOnly ? 'PREVIOUS CHECK-IN SUMMARY' : isFirstCheckIn ? 'INITIAL WEEKLY CHECK-IN' : 'WEEKLY CHECK-IN'}
              </Text>
              <Text style={[styles.headerTitle, { color: textPrimary }]}>{title}</Text>
            </View>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
              disabled={isSaving}
              hitSlop={12}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={26} color={textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* 1. Progress & Weight Card */}
            <View style={[styles.sectionCard, { backgroundColor: innerCardBg, borderColor }]}>
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.sectionLabel, { color: textSecondary }]}>WEIGHT METRICS</Text>
                <View style={[styles.adherencePill, { backgroundColor: adherenceMet ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)' }]}>
                  <Ionicons
                    name={adherenceMet ? 'checkmark-circle' : 'time-outline'}
                    size={14}
                    color={adherenceMet ? '#10B981' : '#F59E0B'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.adherenceText, { color: adherenceMet ? '#10B981' : '#F59E0B' }]}>
                    {daysLogged}/7 Days Logged
                  </Text>
                </View>
              </View>

              <View style={styles.weightsGrid}>
                <View style={styles.weightCol}>
                  <Text style={[styles.weightColLabel, { color: textSecondary }]}>Trend Weight</Text>
                  <Text style={[styles.weightColValue, { color: textPrimary }]}>
                    {formatWeight(currentTrendWeight)} <Text style={styles.unit}>kg</Text>
                  </Text>
                  <Text style={[styles.weightColSub, { color: '#6366F1' }]}>
                    {isReadOnly ? 'Check-in trend' : 'Smoothed baseline'}
                  </Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.weightCol}>
                  <Text style={[styles.weightColLabel, { color: textSecondary }]}>
                    {isReadOnly ? 'Check-In Scale' : "Today's Scale"}
                  </Text>
                  <Text style={[styles.weightColValue, { color: textPrimary }]}>
                    {formatWeight(currentScaleWeight)} <Text style={styles.unit}>kg</Text>
                  </Text>
                  <Text style={[styles.weightColSub, { color: textSecondary }]}>
                    {isReadOnly ? 'Weigh-in' : 'Raw weigh-in'}
                  </Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.weightCol}>
                  <Text style={[styles.weightColLabel, { color: textSecondary }]}>7-Day Net</Text>
                  <Text style={[styles.weightColValue, { color: weightDeltaKg < 0 ? '#10B981' : weightDeltaKg > 0 ? '#F59E0B' : textPrimary }]}>
                    {weightDeltaKg > 0 ? `+${weightDeltaKg}` : `${weightDeltaKg}`} <Text style={styles.unit}>kg</Text>
                  </Text>
                  <Text style={[styles.weightColSub, { color: textSecondary }]}>
                    {ratePercent > 0 ? `+${ratePercent}%` : `${ratePercent}%`}
                  </Text>
                </View>
              </View>
            </View>

            {/* 2. Coach Verdict & Rationale */}
            <View style={[styles.sectionCard, { backgroundColor: innerCardBg, borderColor }]}>
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.sectionLabel, { color: textSecondary }]}>COACH DIAGNOSIS</Text>
                <View style={[styles.badgeContainer, { backgroundColor: badge.bg }]}>
                  <Ionicons name={badge.icon as any} size={12} color={badge.color} style={{ marginRight: 4 }} />
                  <Text style={[styles.badgeLabel, { color: badge.color }]}>{badge.label}</Text>
                </View>
              </View>

              <Text style={[styles.verdictText, { color: textPrimary }]}>{verdict}</Text>
              <Text style={[styles.rationaleText, { color: textSecondary }]}>{rationale}</Text>
            </View>

            {/* 3. Nutrition Targets Comparison */}
            <View style={[styles.sectionCard, { backgroundColor: innerCardBg, borderColor }]}>
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.sectionLabel, { color: textSecondary }]}>
                  {hasTargetChanges ? 'NEW TARGETS' : 'CURRENT TARGETS (MAINTAINED)'}
                </Text>
                {calorieDelta !== 0 && (
                  <View style={[styles.deltaPill, { backgroundColor: calorieDelta > 0 ? 'rgba(99, 102, 241, 0.12)' : 'rgba(245, 158, 11, 0.12)' }]}>
                    <Text style={[styles.deltaText, { color: calorieDelta > 0 ? '#6366F1' : '#F59E0B' }]}>
                      {calorieDelta > 0 ? `+${calorieDelta} kcal` : `${calorieDelta} kcal`}
                    </Text>
                  </View>
                )}
              </View>

              {/* Calories Row */}
              <View style={[styles.targetRow, { borderBottomColor: borderColor }]}>
                <View style={styles.targetIconRow}>
                  <View style={[styles.targetIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                    <Ionicons name="flame" size={18} color="#F59E0B" />
                  </View>
                  <Text style={[styles.targetName, { color: textPrimary }]}>Calories</Text>
                </View>
                <View style={styles.targetValues}>
                  {oldCalories !== newCalories ? (
                    <>
                      <Text style={[styles.oldVal, { color: textSecondary }]}>{oldCalories}</Text>
                      <Ionicons name="arrow-forward" size={14} color={textSecondary} style={{ marginHorizontal: 8 }} />
                      <Text style={[styles.newVal, { color: textPrimary }]}>{newCalories} kcal</Text>
                    </>
                  ) : (
                    <Text style={[styles.newVal, { color: textPrimary }]}>{newCalories} kcal</Text>
                  )}
                </View>
              </View>

              {/* Maintenance Calories Row */}
              {oldMaintenance !== undefined && newMaintenance !== undefined && (
                <View style={[styles.targetRow, { borderBottomColor: borderColor }]}>
                  <View style={styles.targetIconRow}>
                    <View style={[styles.targetIconBox, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                      <Ionicons name="speedometer" size={18} color="#6366F1" />
                    </View>
                    <Text style={[styles.targetName, { color: textPrimary }]}>Maintenance</Text>
                  </View>
                  <View style={styles.targetValues}>
                    {oldMaintenance !== newMaintenance ? (
                      <>
                        <Text style={[styles.oldVal, { color: textSecondary }]}>{oldMaintenance}</Text>
                        <Ionicons name="arrow-forward" size={14} color={textSecondary} style={{ marginHorizontal: 8 }} />
                        <Text style={[styles.newVal, { color: textPrimary }]}>{newMaintenance} kcal</Text>
                      </>
                    ) : (
                      <Text style={[styles.newVal, { color: textPrimary }]}>{newMaintenance} kcal</Text>
                    )}
                  </View>
                </View>
              )}

              {/* Protein Row */}
              <View style={[styles.targetRow, { borderBottomColor: borderColor }]}>
                <View style={styles.targetIconRow}>
                  <View style={[styles.targetIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                    <Ionicons name="barbell" size={18} color="#EF4444" />
                  </View>
                  <Text style={[styles.targetName, { color: textPrimary }]}>Protein</Text>
                </View>
                <View style={styles.targetValues}>
                  {oldProtein !== newProtein ? (
                    <>
                      <Text style={[styles.oldVal, { color: textSecondary }]}>{oldProtein}g</Text>
                      <Ionicons name="arrow-forward" size={14} color={textSecondary} style={{ marginHorizontal: 8 }} />
                      <Text style={[styles.newVal, { color: textPrimary }]}>{newProtein}g</Text>
                    </>
                  ) : (
                    <Text style={[styles.newVal, { color: textPrimary }]}>{newProtein}g</Text>
                  )}
                </View>
              </View>

              {/* Carbs Row */}
              <View style={[styles.targetRow, { borderBottomColor: borderColor }]}>
                <View style={styles.targetIconRow}>
                  <View style={[styles.targetIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                    <Ionicons name="nutrition" size={18} color="#3B82F6" />
                  </View>
                  <Text style={[styles.targetName, { color: textPrimary }]}>Carbs</Text>
                </View>
                <View style={styles.targetValues}>
                  {oldCarbs !== newCarbs ? (
                    <>
                      <Text style={[styles.oldVal, { color: textSecondary }]}>{oldCarbs}g</Text>
                      <Ionicons name="arrow-forward" size={14} color={textSecondary} style={{ marginHorizontal: 8 }} />
                      <Text style={[styles.newVal, { color: textPrimary }]}>{newCarbs}g</Text>
                    </>
                  ) : (
                    <Text style={[styles.newVal, { color: textPrimary }]}>{newCarbs}g</Text>
                  )}
                </View>
              </View>

              {/* Fat Row */}
              <View style={styles.targetRow}>
                <View style={styles.targetIconRow}>
                  <View style={[styles.targetIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                    <Ionicons name="water" size={18} color="#10B981" />
                  </View>
                  <Text style={[styles.targetName, { color: textPrimary }]}>Fat</Text>
                </View>
                <View style={styles.targetValues}>
                  {oldFat !== newFat ? (
                    <>
                      <Text style={[styles.oldVal, { color: textSecondary }]}>{oldFat}g</Text>
                      <Ionicons name="arrow-forward" size={14} color={textSecondary} style={{ marginHorizontal: 8 }} />
                      <Text style={[styles.newVal, { color: textPrimary }]}>{newFat}g</Text>
                    </>
                  ) : (
                    <Text style={[styles.newVal, { color: textPrimary }]}>{newFat}g</Text>
                  )}
                </View>
              </View>
            </View>

            {/* 4. Safety Floor Panel (When at safety floor) */}
            {actionType === 'floor_reached' && (
              <View style={[styles.floorCard, { backgroundColor: isDark ? '#2A1810' : '#FFF7ED', borderColor: '#F97316' }]}>
                <View style={styles.floorHeader}>
                  <Ionicons name="shield-checkmark" size={20} color="#F97316" style={{ marginRight: 8 }} />
                  <Text style={styles.floorTitle}>Metabolic Guardrail Active</Text>
                </View>
                <Text style={[styles.floorDescription, { color: isDark ? '#FED7AA' : '#9A3412' }]}>
                  Your calorie budget is at your safety floor ({safetyFloor} kcal). Cutting calories further would lower thyroid and leptin levels, cause lethargy, and burn muscle.
                </Text>

                <View style={styles.floorTabs}>
                  <Pressable
                    style={[styles.floorTab, activeFloorTab === 'steps' && styles.floorTabActive]}
                    onPress={() => setActiveFloorTab('steps')}
                  >
                    <Text style={[styles.floorTabText, activeFloorTab === 'steps' && styles.floorTabTextActive]}>
                      1. NEAT Steps
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.floorTab, activeFloorTab === 'diet_break' && styles.floorTabActive]}
                    onPress={() => setActiveFloorTab('diet_break')}
                  >
                    <Text style={[styles.floorTabText, activeFloorTab === 'diet_break' && styles.floorTabTextActive]}>
                      2. Diet Break
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.floorTab, activeFloorTab === 'audit' && styles.floorTabActive]}
                    onPress={() => setActiveFloorTab('audit')}
                  >
                    <Text style={[styles.floorTabText, activeFloorTab === 'audit' && styles.floorTabTextActive]}>
                      3. Food Audit
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.floorTabBody}>
                  {activeFloorTab === 'steps' && (
                    <Text style={[styles.floorTabContent, { color: isDark ? '#FFEDD5' : '#7C2D12' }]}>
                      👟 <Text style={{ fontWeight: '700' }}>Increase Daily Movement:</Text> Instead of eating less food, aim to increase daily steps from 5,000 to 8,000. This burns ~200–250 kcal/day while preserving your metabolic rate and energy levels.
                    </Text>
                  )}
                  {activeFloorTab === 'diet_break' && (
                    <Text style={[styles.floorTabContent, { color: isDark ? '#FFEDD5' : '#7C2D12' }]}>
                      🍽️ <Text style={{ fontWeight: '700' }}>1-Week Maintenance Diet Break:</Text> Temporarily raise calories to maintenance for 7–14 days. Clinical studies demonstrate this resets leptin, thyroid, and metabolic expenditure without adding body fat.
                    </Text>
                  )}
                  {activeFloorTab === 'audit' && (
                    <Text style={[styles.floorTabContent, { color: isDark ? '#FFEDD5' : '#7C2D12' }]}>
                      ⚖️ <Text style={{ fontWeight: '700' }}>Digital Food Scale Audit:</Text> Studies show adults unintentionally underestimate food by 30%–50%. Use a gram scale for cooking oils, peanut butter, and dressings for 7 days to eliminate hidden calories.
                    </Text>
                  )}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Action Footer */}
          <View style={[styles.footer, { borderTopColor: borderColor }]}>
            {isReadOnly ? (
              <Pressable
                style={({ pressed }) => [styles.primaryButton, pressed && { opacity: 0.85 }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onClose();
                }}
              >
                <Text style={styles.primaryButtonText}>Close Summary</Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  style={({ pressed }) => [styles.primaryButton, pressed && { opacity: 0.85 }]}
                  onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    onAccept();
                  }}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.primaryButtonText}>
                        {hasTargetChanges ? 'Accept New Targets' : 'Acknowledge & Continue'}
                      </Text>
                      <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
                    </>
                  )}
                </Pressable>

                {hasTargetChanges && (
                  <Pressable
                    style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.7 }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      onKeepCurrent();
                    }}
                    disabled={isSaving}
                  >
                    <Text style={[styles.secondaryButtonText, { color: textSecondary }]}>Keep Current Targets</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  superTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    padding: 4,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  sectionCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  adherencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  adherenceText: {
    fontSize: 12,
    fontWeight: '600',
  },
  weightsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weightCol: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(150, 150, 150, 0.2)',
  },
  weightColLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  weightColValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  unit: {
    fontSize: 12,
    fontWeight: '500',
  },
  weightColSub: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: '500',
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  verdictText: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  rationaleText: {
    fontSize: 13,
    lineHeight: 19,
  },
  deltaPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  deltaText: {
    fontSize: 12,
    fontWeight: '700',
  },
  targetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  targetIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  targetIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  targetName: {
    fontSize: 14,
    fontWeight: '600',
  },
  targetValues: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  oldVal: {
    fontSize: 13,
    textDecorationLine: 'line-through',
  },
  newVal: {
    fontSize: 15,
    fontWeight: '700',
  },
  floorCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 14,
  },
  floorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  floorTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#EA580C',
  },
  floorDescription: {
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 12,
  },
  floorTabs: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  floorTab: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
    alignItems: 'center',
  },
  floorTabActive: {
    backgroundColor: '#EA580C',
  },
  floorTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#EA580C',
  },
  floorTabTextActive: {
    color: '#FFFFFF',
  },
  floorTabBody: {
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 10,
  },
  floorTabContent: {
    fontSize: 12,
    lineHeight: 17,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  primaryButton: {
    flexDirection: 'row',
    backgroundColor: '#6366F1',
    paddingVertical: 14,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
