import React, { useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { FoodItem, MealEstimate, MealTotals } from '@/lib/types';

interface MealReviewModalProps {
  visible: boolean;
  mealType: string;
  estimate: MealEstimate | null;
  onClose: () => void;
  onSave: (mealName: string, title: string, foods: FoodItem[], totals: MealTotals) => void;
  isSaving: boolean;
  isEditMode?: boolean;
}

/**
 * Recalculates a food item's macros proportionally based on a new quantity.
 * This runs instantly on every keystroke for realtime feedback.
 */
function recalculateFoodItem(original: FoodItem, newQuantity: number): FoodItem {
  if (original.quantity === 0 || newQuantity === 0) {
    return { ...original, quantity: newQuantity, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  }
  const ratio = newQuantity / original.quantity;
  return {
    ...original,
    quantity: newQuantity,
    calories: Math.round(original.calories * ratio),
    protein_g: Math.round(original.protein_g * ratio * 10) / 10,
    carbs_g: Math.round(original.carbs_g * ratio * 10) / 10,
    fat_g: Math.round(original.fat_g * ratio * 10) / 10,
  };
}

/** Computes totals from an array of food items */
function computeTotals(foods: FoodItem[]): MealTotals {
  return foods.reduce(
    (acc, f) => ({
      calories: acc.calories + f.calories,
      protein_g: Math.round((acc.protein_g + f.protein_g) * 10) / 10,
      carbs_g: Math.round((acc.carbs_g + f.carbs_g) * 10) / 10,
      fat_g: Math.round((acc.fat_g + f.fat_g) * 10) / 10,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
}

export interface ReviewFoodItem extends FoodItem {
  _id: string;
  _quantityStr?: string;
}

export function MealReviewModal({
  visible,
  mealType,
  estimate,
  onClose,
  onSave,
  isSaving,
  isEditMode = false,
}: MealReviewModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // We keep the *original* estimate to compute ratios from, and a *current* list
  // that tracks the user's edits with stable unique _id keys.
  const [originalFoods, setOriginalFoods] = useState<ReviewFoodItem[]>([]);
  const [currentFoods, setCurrentFoods] = useState<ReviewFoodItem[]>([]);
  const [mealName, setMealName] = useState('');
  const [title, setTitle] = useState('');
  
  const firstSwipeableRef = React.useRef<Swipeable>(null);
  const swipeableRowRefs = React.useRef<Map<string, Swipeable>>(new Map());
  const tipAnim = useSharedValue(0);
  const tipTimeout1 = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipTimeout2 = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (visible && currentFoods.length > 0) {
      checkSwipeTip();
    }
    return () => {
      if (tipTimeout1.current) clearTimeout(tipTimeout1.current);
      if (tipTimeout2.current) clearTimeout(tipTimeout2.current);
    };
  }, [visible, currentFoods.length]);

  const checkSwipeTip = async () => {
    try {
      const hasSeen = await AsyncStorage.getItem('has_seen_swipe_delete_tip');
      if (!hasSeen) {
        tipTimeout1.current = setTimeout(() => {
          if (firstSwipeableRef.current) {
            firstSwipeableRef.current.openRight();
            tipAnim.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });
            tipTimeout2.current = setTimeout(() => {
              firstSwipeableRef.current?.close();
              AsyncStorage.setItem('has_seen_swipe_delete_tip', 'true');
              tipAnim.value = withTiming(0, { duration: 300, easing: Easing.inOut(Easing.ease) });
            }, 2500);
          }
        }, 800);
      }
    } catch (e) {}
  };

  const animatedTipStyle = useAnimatedStyle(() => ({
    opacity: tipAnim.value,
    transform: [{ translateY: (1 - tipAnim.value) * -10 }],
  }));

  // Re-initialize when the estimate changes
  React.useEffect(() => {
    if (estimate) {
      const foodsWithId: ReviewFoodItem[] = (estimate.foods || []).map((f, i) => ({
        ...f,
        _id: (f as any).id || (f as any)._id || `food_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 8)}`,
      }));
      setOriginalFoods(foodsWithId);
      setCurrentFoods(foodsWithId);
      setMealName(estimate.meal_name);
      setTitle(estimate.title || estimate.meal_name);
    }
  }, [estimate]);

  const totals = computeTotals(currentFoods);

  const handleQuantityChange = useCallback(
    (foodId: string, value: string) => {
      // Strip anything that is not a digit or a decimal point
      let sanitizedValue = value.replace(/[^0-9.]/g, '');
      
      // Ensure only one decimal point exists
      const parts = sanitizedValue.split('.');
      if (parts.length > 2) {
        sanitizedValue = parts[0] + '.' + parts.slice(1).join('');
      }

      const numericValue = parseFloat(sanitizedValue) || 0;
      
      const orig = originalFoods.find(f => f._id === foodId);
      if (!orig) return;

      setCurrentFoods((prev) => {
        return prev.map(f => {
          if (f._id !== foodId) return f;
          const recalculated = recalculateFoodItem(orig, numericValue);
          return {
            ...recalculated,
            _id: f._id,
            quantity: numericValue,
            _quantityStr: sanitizedValue,
          };
        });
      });
    },
    [originalFoods]
  );

  const handleDeleteItem = useCallback((foodId: string) => {
    // Immediately close swipeable if active before deleting from state
    swipeableRowRefs.current.get(foodId)?.close();
    swipeableRowRefs.current.delete(foodId);

    setCurrentFoods((prev) => prev.filter((f) => f._id !== foodId));
    setOriginalFoods((prev) => prev.filter((f) => f._id !== foodId));
  }, []);

  const validFoods = currentFoods.filter(f => (f.calories || 0) > 0 && (f.quantity || 0) > 0);
  const isZeroMeal = validFoods.length === 0 || totals.calories <= 0;

  const handleSave = () => {
    const finalMealName = (mealName.trim() || estimate?.meal_name || mealType).trim();
    const finalTitle = (title.trim() || finalMealName).trim();

    if (isZeroMeal) {
      if (isEditMode) {
        onSave(finalMealName, finalTitle, [], { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
      } else {
        onClose();
      }
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Strip internal UI properties (_id, _quantityStr)
    const cleanedFoods: FoodItem[] = validFoods.map(({ _id, _quantityStr, ...rest }) => rest);
    onSave(finalMealName, finalTitle, cleanedFoods, computeTotals(cleanedFoods));
  };

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const inputBg = isDark ? '#0F172A' : '#F8FAFC';
  const rowBg = isDark ? '#334155' : '#F1F5F9';

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 10,
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > 50) {
            onClose();
          }
        },
      }),
    [onClose]
  );

  if (!estimate) return null;

  return (
    <Modal 
      visible={visible} 
      transparent={true} 
      animationType="slide" 
      presentationStyle={Platform.OS === 'ios' ? "pageSheet" : undefined}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        {Platform.OS !== 'ios' && (
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        )}
        <View style={[styles.modalContent, { backgroundColor: cardBg }]}>
          {/* Handle bar */}
          <View style={{ alignItems: 'center', paddingVertical: 16, marginTop: -24 }} {...panResponder.panHandlers}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: borderColor }} />
          </View>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: textPrimary }]}>Review {mealType}</Text>
              <Text style={[styles.confidence, { color: textSecondary }]}>
                AI Confidence: {Math.round((estimate.confidence || 0.9) * 100)}%
              </Text>
            </View>
            <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onClose(); }} disabled={isSaving} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} style={{ padding: 4 }}>
              <Ionicons name="close" size={28} color={textSecondary} />
            </Pressable>
          </View>

          {/* Meal Name (Editable) */}
          <View style={[styles.mealNameRow, { borderColor }]}>
            <View
              style={[
                styles.mealNameInputWrapper,
                {
                  borderColor,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                },
              ]}
            >
              <Text style={{ fontSize: 20 }}>🍽️</Text>
              <TextInput
                style={[styles.mealNameInput, { color: textPrimary }]}
                value={mealName}
                onChangeText={(text) => {
                  setMealName(text);
                  setTitle(text);
                }}
                placeholder="Meal Name (e.g. Chicken Rice Bowl)"
                placeholderTextColor={textSecondary}
                maxLength={50}
                returnKeyType="done"
              />
              <Ionicons name="pencil" size={15} color={textSecondary} />
            </View>
          </View>

          {/* Foods Table */}
          <GestureHandlerRootView style={{ flex: 0 }}>
            <Animated.View style={[styles.swipeTipBubble, animatedTipStyle]} pointerEvents="none">
              <Text style={styles.swipeTipText}>Swipe left to delete!</Text>
              <View style={styles.swipeTipArrow} />
            </Animated.View>
            <ScrollView style={styles.foodsList} showsVerticalScrollIndicator={false}>
              {/* Table Header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { color: textSecondary, flex: 2 }]}>Food</Text>
                <Text style={[styles.tableHeaderText, { color: textSecondary, flex: 1.2, textAlign: 'center' }]}>Amount</Text>
                <Text style={[styles.tableHeaderText, { color: textSecondary, flex: 1, textAlign: 'right' }]}>Calories</Text>
              </View>

              {currentFoods.length === 0 ? (
                <View style={styles.emptyFoodsContainer}>
                  <Ionicons name="trash-outline" size={32} color={textSecondary} />
                  <Text style={[styles.emptyFoodsText, { color: textSecondary }]}>
                    All items removed.{isEditMode ? ' Save to delete this meal.' : ' You can discard this meal.'}
                  </Text>
                </View>
              ) : (
                currentFoods.map((food, index) => (
                  <Swipeable
                    key={food._id}
                    ref={(ref) => {
                      if (ref) {
                        swipeableRowRefs.current.set(food._id, ref);
                        if (index === 0) (firstSwipeableRef as any).current = ref;
                      } else {
                        swipeableRowRefs.current.delete(food._id);
                      }
                    }}
                    renderRightActions={() => (
                      <Pressable
                        style={styles.deleteButton}
                        onPress={() => handleDeleteItem(food._id)}
                      >
                        <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
                      </Pressable>
                    )}
                  >
                    <View style={[styles.foodRow, { backgroundColor: rowBg }]}>
                      <View style={{ flex: 2 }}>
                        <Text style={[styles.foodName, { color: textPrimary }]}>{food.name}</Text>
                        <Text style={[styles.foodMacros, { color: textSecondary }]}>
                          P: {food.protein_g}g · C: {food.carbs_g}g · F: {food.fat_g}g
                        </Text>
                      </View>
                      <View style={[styles.quantityCell, { flex: 1.2 }]}>
                        <TextInput
                          style={[
                            styles.quantityInput,
                            { backgroundColor: inputBg, color: textPrimary, borderColor },
                          ]}
                          value={food._quantityStr !== undefined ? food._quantityStr : (food.quantity ? food.quantity.toString() : '')}
                          onChangeText={(v) => handleQuantityChange(food._id, v)}
                          keyboardType="decimal-pad"
                          selectTextOnFocus
                        />
                        <Text style={[styles.unitText, { color: textSecondary }]}>{food.unit}</Text>
                      </View>
                      <Text style={[styles.calorieText, { color: textPrimary, flex: 1 }]}>
                        {food.calories} kcal
                      </Text>
                    </View>
                  </Swipeable>
                ))
              )}
            </ScrollView>
          </GestureHandlerRootView>

          {/* Totals */}
          <View style={[styles.totalsContainer, { borderColor }]}>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: textPrimary }]}>Total</Text>
              <Text style={[styles.totalCalories, { color: '#10B981' }]}>{totals.calories} kcal</Text>
            </View>
            <View style={styles.macroSummary}>
              <View style={styles.macroChip}>
                <View style={[styles.macroDot, { backgroundColor: '#34D399' }]} />
                <Text style={[styles.macroChipText, { color: textSecondary }]}>
                  Protein {totals.protein_g}g
                </Text>
              </View>
              <View style={styles.macroChip}>
                <View style={[styles.macroDot, { backgroundColor: '#60A5FA' }]} />
                <Text style={[styles.macroChipText, { color: textSecondary }]}>
                  Carbs {totals.carbs_g}g
                </Text>
              </View>
              <View style={styles.macroChip}>
                <View style={[styles.macroDot, { backgroundColor: '#FB923C' }]} />
                <Text style={[styles.macroChipText, { color: textSecondary }]}>
                  Fat {totals.fat_g}g
                </Text>
              </View>
            </View>
          </View>

          {/* Save Button */}
          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              isZeroMeal && styles.deleteEntryButton,
              pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
              isSaving && styles.saveButtonDisabled,
            ]}
            onPress={isZeroMeal && !isEditMode ? onClose : handleSave}
            disabled={isSaving}
          >
            <Text style={styles.saveButtonText}>
              {isSaving
                ? (isZeroMeal && isEditMode ? 'Deleting...' : 'Saving...')
                : isZeroMeal
                  ? (isEditMode ? 'Delete Meal' : 'Discard Meal')
                  : isEditMode
                    ? 'Update Meal'
                    : 'Save Meal'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  confidence: {
    fontSize: 12,
    marginTop: 2,
  },
  mealNameRow: {
    paddingBottom: 14,
    marginBottom: 12,
    borderBottomWidth: 1,
  },
  mealNameInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    gap: 8,
  },
  mealNameInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    padding: 0,
  },
  foodsList: {
    maxHeight: 280,
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  foodName: {
    fontSize: 15,
    fontWeight: '600',
  },
  foodMacros: {
    fontSize: 11,
    marginTop: 2,
  },
  quantityCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  quantityInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    width: 60,
  },
  unitText: {
    fontSize: 12,
  },
  calorieText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  deleteButton: {
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 60,
    borderRadius: 12,
    marginBottom: 8,
    marginLeft: 8,
  },
  swipeTipBubble: {
    position: 'absolute',
    top: -30,
    alignSelf: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    zIndex: 100,
    elevation: 5,
  },
  swipeTipText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  swipeTipArrow: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#10B981',
    position: 'absolute',
    bottom: -8,
    left: '50%',
    marginLeft: -8,
  },
  totalsContainer: {
    borderTopWidth: 1,
    paddingTop: 14,
    marginBottom: 16,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '700',
  },
  totalCalories: {
    fontSize: 22,
    fontWeight: '800',
  },
  macroSummary: {
    flexDirection: 'row',
    gap: 12,
  },
  macroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  macroDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  macroChipText: {
    fontSize: 13,
  },
  saveButton: {
    backgroundColor: '#10B981',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  emptyFoodsContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  emptyFoodsText: {
    fontSize: 14,
    textAlign: 'center',
  },
  deleteEntryButton: {
    backgroundColor: '#EF4444',
  },
  saveButtonDisabled: {
    backgroundColor: '#6EE7B7',
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
