import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { FoodItem } from '@/lib/types';

export interface RepeatMealCandidate {
  id: string;
  meal_name: string;
  created_at: string;
  timeStr: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  foods: FoodItem[];
  foodSummary: string;
}

interface RepeatMealSelectorModalProps {
  visible: boolean;
  mealType: string;
  candidates: RepeatMealCandidate[];
  onClose: () => void;
  onConfirm: (selected: RepeatMealCandidate[]) => void;
}

export function RepeatMealSelectorModal({
  visible,
  mealType,
  candidates,
  onClose,
  onConfirm,
}: RepeatMealSelectorModalProps) {
  const isDark = useColorScheme() === 'dark';
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const isSmallDevice = screenWidth < 380;
  const isShortDevice = screenHeight < 740;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reset selection when modal opens or candidates change
  useEffect(() => {
    if (visible) {
      // Start with empty selection so the user can directly pick the 1 meal they want in 1 tap,
      // or use "Select All" to pick all with 1 tap.
      setSelectedIds(new Set());
    }
  }, [visible, candidates]);

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const innerCardBg = isDark ? '#0F172A' : '#F8FAFC';

  const toggleSelect = (id: string) => {
    Haptics.selectionAsync();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (selectedIds.size === candidates.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(candidates.map((c) => c.id)));
    }
  };

  const handleContinue = () => {
    if (selectedIds.size === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const selected = candidates.filter((c) => selectedIds.has(c.id));
    onConfirm(selected);
  };

  const isAllSelected = candidates.length > 0 && selectedIds.size === candidates.length;
  const selectedCount = selectedIds.size;

  const sheetMaxHeight = Math.min(screenHeight * 0.85, isShortDevice ? 580 : 660);
  const containerMaxWidth = Math.min(screenWidth, 500);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: cardBg,
              maxHeight: sheetMaxHeight,
              maxWidth: containerMaxWidth,
              paddingHorizontal: isSmallDevice ? 16 : 20,
              paddingTop: 12,
              paddingBottom: Platform.OS === 'ios' ? 28 : 20,
            },
          ]}
        >
          {/* Top handle bar */}
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: borderColor }]} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.superTitle}>REPEAT YESTERDAY</Text>
              <Text style={[styles.headerTitle, { color: textPrimary }]} numberOfLines={1}>
                Yesterday's {mealType}s
              </Text>
              <Text style={[styles.subtitle, { color: textSecondary }]} numberOfLines={1}>
                Choose which meal(s) to copy to today
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.closeButton,
                { backgroundColor: isDark ? '#334155' : '#F1F5F9' },
                pressed && { opacity: 0.7 },
              ]}
              onPress={onClose}
              hitSlop={8}
            >
              <Ionicons name="close" size={20} color={textSecondary} />
            </Pressable>
          </View>

          {/* Toolbar: Counter + Select All button */}
          <View style={[styles.toolbar, { borderColor }]}>
            <Text style={[styles.counterText, { color: textSecondary }]}>
              {selectedCount} of {candidates.length} selected
            </Text>

            <Pressable
              onPress={handleSelectAll}
              hitSlop={8}
              style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.selectAllText}>
                {isAllSelected ? 'Deselect All' : 'Select All'}
              </Text>
            </Pressable>
          </View>

          {/* Candidate Meals List */}
          <ScrollView
            style={styles.scrollList}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {candidates.map((cand) => {
              const isSelected = selectedIds.has(cand.id);

              return (
                <Pressable
                  key={cand.id}
                  style={({ pressed }) => [
                    styles.candidateCard,
                    {
                      backgroundColor: isSelected
                        ? isDark
                          ? 'rgba(16, 185, 129, 0.12)'
                          : '#F0FDF4'
                        : innerCardBg,
                      borderColor: isSelected ? '#10B981' : borderColor,
                      borderWidth: isSelected ? 1.5 : 1,
                    },
                    pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
                  ]}
                  onPress={() => toggleSelect(cand.id)}
                >
                  {/* Selection Checkbox */}
                  <View
                    style={[
                      styles.checkbox,
                      isSelected
                        ? styles.checkboxSelected
                        : [styles.checkboxUnselected, { borderColor: isDark ? '#475569' : '#CBD5E1' }],
                    ]}
                  >
                    {isSelected && (
                      <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                    )}
                  </View>

                  {/* Card Content */}
                  <View style={styles.cardContent}>
                    {/* Top Row: Name + Time badge */}
                    <View style={styles.cardTopRow}>
                      <Text
                        style={[
                          styles.cardMealName,
                          { color: textPrimary, fontSize: isSmallDevice ? 14.5 : 15.5 },
                        ]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {cand.meal_name}
                      </Text>

                      {cand.timeStr ? (
                        <View
                          style={[
                            styles.timeBadge,
                            { backgroundColor: isDark ? '#334155' : '#F1F5F9' },
                          ]}
                        >
                          <Ionicons
                            name="time-outline"
                            size={11}
                            color={textSecondary}
                            style={{ marginRight: 3 }}
                          />
                          <Text style={[styles.timeBadgeText, { color: textSecondary }]}>
                            {cand.timeStr}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Middle Row: Calories & Macros */}
                    <View style={styles.macroRow}>
                      <View
                        style={[
                          styles.caloriesBadge,
                          {
                            backgroundColor: isDark
                              ? 'rgba(16, 185, 129, 0.2)'
                              : 'rgba(16, 185, 129, 0.12)',
                          },
                        ]}
                      >
                        <Text style={styles.caloriesText}>
                          {Math.round(cand.calories)} kcal
                        </Text>
                      </View>

                      <Text style={[styles.macrosText, { color: textSecondary }]}>
                        {Math.round(cand.protein)}g P • {Math.round(cand.carbs)}g C • {Math.round(cand.fat)}g F
                      </Text>
                    </View>

                    {/* Bottom Row: Food Items Preview */}
                    {cand.foodSummary ? (
                      <View style={styles.foodSummaryRow}>
                        <Ionicons
                          name="restaurant-outline"
                          size={11}
                          color={textSecondary}
                          style={{ marginRight: 4, marginTop: 1 }}
                        />
                        <Text
                          style={[styles.foodSummaryText, { color: textSecondary }]}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {cand.foodSummary}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Sticky Footer */}
          <View style={[styles.footer, { borderColor }]}>
            <Pressable
              style={({ pressed }) => [
                styles.continueBtn,
                selectedCount === 0 && styles.continueBtnDisabled,
                pressed && selectedCount > 0 && { opacity: 0.88, transform: [{ scale: 0.99 }] },
              ]}
              onPress={handleContinue}
              disabled={selectedCount === 0}
            >
              <Text style={styles.continueBtnText}>
                {selectedCount === 0
                  ? 'Select meal to continue'
                  : selectedCount === 1
                  ? 'Repeat 1 Meal'
                  : `Repeat ${selectedCount} Meals`}
              </Text>
              {selectedCount > 0 && (
                <Ionicons
                  name="arrow-forward"
                  size={17}
                  color="#FFFFFF"
                  style={{ marginLeft: 6 }}
                />
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheetContainer: {
    width: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  handleContainer: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  superTitle: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#10B981',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12.5,
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  counterText: {
    fontSize: 12,
    fontWeight: '600',
  },
  selectAllText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#10B981',
  },
  scrollList: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: 4,
  },
  candidateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 12,
    marginBottom: 9,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },
  checkboxSelected: {
    backgroundColor: '#10B981',
  },
  checkboxUnselected: {
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  cardContent: {
    flex: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  cardMealName: {
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  timeBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 3,
  },
  caloriesBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  caloriesText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#10B981',
  },
  macrosText: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  foodSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  foodSummaryText: {
    fontSize: 11.5,
    flex: 1,
  },
  footer: {
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  continueBtn: {
    flexDirection: 'row',
    backgroundColor: '#10B981',
    paddingVertical: 13,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  continueBtnDisabled: {
    opacity: 0.45,
    shadowOpacity: 0,
    elevation: 0,
  },
  continueBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
  },
});
