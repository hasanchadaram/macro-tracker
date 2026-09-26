import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMyFoods } from '@/hooks/useMyFoods';
import { FoodSkeletonLoader } from '@/components/ui/FoodSkeletonLoader';
import type { UserFood, GlobalFood, FoodItem, MealTotals } from '@/lib/types';

interface MyFoodPickerSheetProps {
  visible: boolean;
  mealType: string;
  onClose: () => void;
  onSelectFood: (mealName: string, foods: FoodItem[], totals: MealTotals) => void;
  onCreateNew?: () => void;
  initialFood?: UserFood | null;
}

type TabType = 'my_foods' | 'global';

export function MyFoodPickerSheet({
  visible,
  mealType,
  onClose,
  onSelectFood,
  onCreateNew,
  initialFood,
}: MyFoodPickerSheetProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { myFoods, isLoading: isMyFoodsLoading, searchMyFoods, searchGlobalFoods, recordUse } = useMyFoods();

  const [activeTab, setActiveTab] = useState<TabType>('my_foods');
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredMyFoods, setFilteredMyFoods] = useState<UserFood[]>([]);
  const [globalResults, setGlobalResults] = useState<GlobalFood[]>([]);
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);

  // Selected food for portion configuration
  const [selectedFood, setSelectedFood] = useState<{
    id?: string;
    name: string;
    emoji?: string | null;
    isUserFood: boolean;
    per_100g: {
      calories: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
      fiber_g?: number;
      sodium_mg?: number;
    };
    default_serving_g?: number | null;
    default_serving_label?: string | null;
  } | null>(null);

  const [portionGrams, setPortionGrams] = useState('100');
  const [multiplier, setMultiplier] = useState<number>(1);

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const inputBg = isDark ? '#0F172A' : '#F8FAFC';
  const buttonBg = isDark ? '#334155' : '#F1F5F9';

  // Sync initialFood when picker is opened with a pre-selected food
  useEffect(() => {
    if (visible && initialFood) {
      const defaultG = initialFood.default_serving_g || 100;
      setSelectedFood({
        id: initialFood.id,
        name: initialFood.name,
        emoji: initialFood.emoji,
        isUserFood: true,
        per_100g: initialFood.per_100g,
        default_serving_g: initialFood.default_serving_g,
        default_serving_label: initialFood.default_serving_label,
      });
      setPortionGrams(defaultG.toString());
      setMultiplier(1);
    } else if (visible && !initialFood) {
      setSelectedFood(null);
    }
  }, [visible, initialFood]);

  // Sync and filter myFoods instantly (0ms client-side, case-insensitive, word prefix & substring matching)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredMyFoods(myFoods);
    } else {
      const q = searchQuery.toLowerCase().trim();
      const qWords = q.split(/\s+/).filter(Boolean);
      const filtered = myFoods.filter((f) => {
        const name = f.name.toLowerCase();
        if (name.includes(q)) return true;
        if (qWords.length > 1 && qWords.every((w) => name.includes(w))) return true;
        const words = name.split(/[\s,.-]+/);
        return words.some((w) => w.startsWith(q));
      });
      setFilteredMyFoods(filtered);
    }
  }, [myFoods, searchQuery]);

  // Handle global food search
  useEffect(() => {
    if (activeTab !== 'global') return;

    const timer = setTimeout(async () => {
      setIsSearchingGlobal(true);
      try {
        const results = await searchGlobalFoods(searchQuery);
        setGlobalResults(results);
      } catch (e) {
        console.error('Error searching global foods:', e);
      } finally {
        setIsSearchingGlobal(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, activeTab, searchGlobalFoods]);

  // Reset portion inputs when a food is selected
  const handleSelectFoodItem = (item: UserFood | GlobalFood, isUserFood: boolean) => {
    Haptics.selectionAsync();
    const defaultG = 'default_serving_g' in item && item.default_serving_g ? item.default_serving_g : 100;
    setSelectedFood({
      id: item.id,
      name: item.name,
      emoji: 'emoji' in item ? item.emoji : null,
      isUserFood,
      per_100g: item.per_100g,
      default_serving_g: 'default_serving_g' in item ? item.default_serving_g : null,
      default_serving_label: 'default_serving_label' in item ? item.default_serving_label : null,
    });
    setPortionGrams(defaultG.toString());
    setMultiplier(1);
  };

  const handleMultiplierPress = (mult: number) => {
    Haptics.selectionAsync();
    setMultiplier(mult);
    const baseG = selectedFood?.default_serving_g || 100;
    setPortionGrams(Math.round(baseG * mult).toString());
  };

  const handleConfirmPortion = () => {
    if (!selectedFood) return;
    const grams = parseFloat(portionGrams) || 100;
    const factor = grams / 100;

    const calories = Math.round(selectedFood.per_100g.calories * factor);
    const protein_g = Math.round(selectedFood.per_100g.protein_g * factor * 10) / 10;
    const carbs_g = Math.round(selectedFood.per_100g.carbs_g * factor * 10) / 10;
    const fat_g = Math.round(selectedFood.per_100g.fat_g * factor * 10) / 10;

    const foodItem: FoodItem = {
      name: selectedFood.name,
      quantity: grams,
      unit: 'g',
      calories,
      protein_g,
      carbs_g,
      fat_g,
    };

    const mealTotals: MealTotals = {
      calories,
      protein_g,
      carbs_g,
      fat_g,
    };

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Record use in user_foods
    if (selectedFood.isUserFood && selectedFood.id) {
      recordUse(selectedFood.id);
    }

    onSelectFood(selectedFood.name, [foodItem], mealTotals);
    setSelectedFood(null);
    onClose();
  };

  const renderFoodItem = ({ item }: { item: UserFood }) => (
    <Pressable
      style={({ pressed }) => [
        styles.foodRow,
        { backgroundColor: cardBg, borderColor },
        pressed && { opacity: 0.75 },
      ]}
      onPress={() => handleSelectFoodItem(item, true)}
    >
      <View style={styles.foodRowLeft}>
        <View style={[styles.foodIconWrap, { backgroundColor: buttonBg }]}>
          {item.emoji ? (
            <Text style={styles.foodEmoji}>{item.emoji}</Text>
          ) : (
            <Ionicons name="book-outline" size={20} color="#10B981" />
          )}
        </View>
        <View style={styles.foodTextWrap}>
          <View style={styles.nameRow}>
            <Text style={[styles.foodName, { color: textPrimary }]} numberOfLines={1}>
              {item.name}
            </Text>
            {item.source && item.source !== 'manual' && (
              <View style={[styles.badge, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}>
                <Text style={[styles.badgeText, { color: textSecondary }]}>
                  {item.source === 'photo' ? '📷' : item.source === 'describe' ? '✍️' : '🔗'}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.foodMacros, { color: textSecondary }]}>
            {item.per_100g.calories} kcal/100g • P: {item.per_100g.protein_g}g C: {item.per_100g.carbs_g}g F: {item.per_100g.fat_g}g
          </Text>
          {item.default_serving_label && (
            <Text style={[styles.servingLabel, { color: '#10B981' }]}>
              Default: {item.default_serving_label} ({item.default_serving_g || 100}g)
            </Text>
          )}
        </View>
      </View>
      <View style={styles.addBtn}>
        <Ionicons name="add" size={22} color="#10B981" />
      </View>
    </Pressable>
  );

  const renderGlobalItem = ({ item }: { item: GlobalFood }) => (
    <Pressable
      style={({ pressed }) => [
        styles.foodRow,
        { backgroundColor: cardBg, borderColor },
        pressed && { opacity: 0.75 },
      ]}
      onPress={() => handleSelectFoodItem(item, false)}
    >
      <View style={styles.foodRowLeft}>
        <View style={[styles.foodIconWrap, { backgroundColor: buttonBg }]}>
          <Ionicons name="globe-outline" size={20} color="#3B82F6" />
        </View>
        <View style={styles.foodTextWrap}>
          <Text style={[styles.foodName, { color: textPrimary }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.foodMacros, { color: textSecondary }]}>
            {item.per_100g.calories} kcal/100g • P: {item.per_100g.protein_g}g C: {item.per_100g.carbs_g}g F: {item.per_100g.fat_g}g
          </Text>
          {item.category && (
            <Text style={[styles.servingLabel, { color: textSecondary }]}>
              {item.category.replace('_', ' ')}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.addBtn}>
        <Ionicons name="add" size={22} color="#3B82F6" />
      </View>
    </Pressable>
  );

  // Portion preview calculations
  const gramsNum = parseFloat(portionGrams) || 0;
  const factor = gramsNum / 100;
  const previewCal = selectedFood ? Math.round(selectedFood.per_100g.calories * factor) : 0;
  const previewP = selectedFood ? Math.round(selectedFood.per_100g.protein_g * factor * 10) / 10 : 0;
  const previewC = selectedFood ? Math.round(selectedFood.per_100g.carbs_g * factor * 10) / 10 : 0;
  const previewF = selectedFood ? Math.round(selectedFood.per_100g.fat_g * factor * 10) / 10 : 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={[styles.sheetContent, { backgroundColor: cardBg }]}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: textPrimary }]}>Pick a Food</Text>
              <Text style={[styles.subtitle, { color: textSecondary }]}>Add to {mealType}</Text>
            </View>
            <Pressable
              style={styles.closeBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (selectedFood) {
                  setSelectedFood(null);
                } else {
                  onClose();
                }
              }}
            >
              <Ionicons name="close" size={24} color={textSecondary} />
            </Pressable>
          </View>

          {/* Portion Configuration Step (if item selected) */}
          {selectedFood ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.portionContainer}>
              <View style={[styles.selectedHeaderCard, { backgroundColor: buttonBg, borderColor }]}>
                <View style={styles.selectedTitleRow}>
                  {selectedFood.emoji && <Text style={{ fontSize: 24, marginRight: 8 }}>{selectedFood.emoji}</Text>}
                  <Text style={[styles.selectedName, { color: textPrimary }]} numberOfLines={2}>
                    {selectedFood.name}
                  </Text>
                </View>
                <Text style={[styles.selectedBaseInfo, { color: textSecondary }]}>
                  Reference: {selectedFood.per_100g.calories} kcal per 100g
                </Text>
              </View>

              {/* Portion Input */}
              <View style={styles.portionInputSection}>
                <Text style={[styles.sectionLabel, { color: textPrimary }]}>Serving Amount (grams)</Text>
                <View style={[styles.portionInputWrap, { backgroundColor: inputBg, borderColor }]}>
                  <TextInput
                    style={[styles.portionInput, { color: textPrimary }]}
                    keyboardType="numeric"
                    value={portionGrams}
                    onChangeText={(val) => {
                      setPortionGrams(val);
                      setMultiplier(0);
                    }}
                    selectTextOnFocus
                    autoFocus
                  />
                  <Text style={[styles.unitText, { color: textSecondary }]}>grams</Text>
                </View>

                {/* Multiplier Presets */}
                <View style={styles.multipliersRow}>
                  {[0.5, 1, 1.5, 2].map((m) => (
                    <Pressable
                      key={m}
                      style={[
                        styles.multBtn,
                        { backgroundColor: buttonBg, borderColor },
                        multiplier === m && styles.multBtnActive,
                      ]}
                      onPress={() => handleMultiplierPress(m)}
                    >
                      <Text
                        style={[
                          styles.multBtnText,
                          { color: textPrimary },
                          multiplier === m && styles.multBtnTextActive,
                        ]}
                      >
                        {m}x
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {selectedFood.default_serving_label && (
                  <Text style={[styles.helperNote, { color: textSecondary }]}>
                    1 serving = {selectedFood.default_serving_label} ({selectedFood.default_serving_g || 100}g)
                  </Text>
                )}
              </View>

              {/* Live Macros Card */}
              <View style={[styles.macrosCard, { backgroundColor: buttonBg, borderColor }]}>
                <View style={styles.macroCalCol}>
                  <Text style={styles.macroCalVal}>{previewCal}</Text>
                  <Text style={[styles.macroCalLbl, { color: textSecondary }]}>Calories</Text>
                </View>
                <View style={styles.macroDivider} />
                <View style={styles.macroNutrientCol}>
                  <Text style={[styles.nutrientVal, { color: '#10B981' }]}>{previewP}g</Text>
                  <Text style={[styles.nutrientLbl, { color: textSecondary }]}>Protein</Text>
                </View>
                <View style={styles.macroNutrientCol}>
                  <Text style={[styles.nutrientVal, { color: '#3B82F6' }]}>{previewC}g</Text>
                  <Text style={[styles.nutrientLbl, { color: textSecondary }]}>Carbs</Text>
                </View>
                <View style={styles.macroNutrientCol}>
                  <Text style={[styles.nutrientVal, { color: '#F59E0B' }]}>{previewF}g</Text>
                  <Text style={[styles.nutrientLbl, { color: textSecondary }]}>Fat</Text>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionButtons}>
                <Pressable
                  style={[styles.backBtn, { borderColor }]}
                  onPress={() => setSelectedFood(null)}
                >
                  <Text style={[styles.backBtnText, { color: textSecondary }]}>Back</Text>
                </Pressable>
                <Pressable
                  style={[styles.confirmBtn, gramsNum <= 0 && styles.confirmBtnDisabled]}
                  onPress={handleConfirmPortion}
                  disabled={gramsNum <= 0}
                >
                  <Text style={styles.confirmBtnText}>Add to {mealType}</Text>
                </Pressable>
              </View>
            </ScrollView>
          ) : (
            /* Food List Step */
            <>
              {/* Search Bar */}
              <View style={[styles.searchBar, { backgroundColor: inputBg, borderColor }]}>
                <Ionicons name="search" size={18} color={textSecondary} style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.searchInput, { color: textPrimary }]}
                  placeholder={activeTab === 'my_foods' ? "Search your foods..." : "Search global food database..."}
                  placeholderTextColor={textSecondary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={textSecondary} />
                  </Pressable>
                )}
              </View>

              {/* Tabs */}
              <View style={[styles.tabBar, { backgroundColor: buttonBg }]}>
                <Pressable
                  style={[styles.tabItem, activeTab === 'my_foods' && [styles.tabItemActive, { backgroundColor: cardBg }]]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setActiveTab('my_foods');
                  }}
                >
                  <Text
                    style={[
                      styles.tabText,
                      { color: textSecondary },
                      activeTab === 'my_foods' && [styles.tabTextActive, { color: textPrimary }],
                    ]}
                  >
                    📚 My Foods ({myFoods.length})
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.tabItem, activeTab === 'global' && [styles.tabItemActive, { backgroundColor: cardBg }]]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setActiveTab('global');
                  }}
                >
                  <Text
                    style={[
                      styles.tabText,
                      { color: textSecondary },
                      activeTab === 'global' && [styles.tabTextActive, { color: textPrimary }],
                    ]}
                  >
                    🌍 Global Catalog
                  </Text>
                </Pressable>
              </View>

              {/* Tab Content */}
              {activeTab === 'my_foods' ? (
                isMyFoodsLoading ? (
                  <View style={{ flex: 1, paddingTop: 4 }}>
                    <FoodSkeletonLoader count={5} />
                  </View>
                ) : filteredMyFoods.length === 0 ? (
                  <View style={styles.centerBox}>
                    <Ionicons name="restaurant-outline" size={48} color={textSecondary} />
                    <Text style={[styles.emptyTitle, { color: textPrimary }]}>
                      {searchQuery ? 'No matching foods found' : 'Your food library is empty'}
                    </Text>
                    <Text style={[styles.emptySub, { color: textSecondary }]}>
                      {searchQuery
                        ? 'Try searching with different terms or check Global Catalog.'
                        : 'Create custom foods with your own recipe & macro measurements.'}
                    </Text>
                    {onCreateNew && (
                      <Pressable
                        style={styles.createNewBtn}
                        onPress={() => {
                          onClose();
                          onCreateNew();
                        }}
                      >
                        <Ionicons name="add" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                        <Text style={styles.createNewBtnText}>Create New Food</Text>
                      </Pressable>
                    )}
                  </View>
                ) : (
                  <FlatList
                    data={filteredMyFoods}
                    keyExtractor={(item) => item.id}
                    renderItem={renderFoodItem}
                    contentContainerStyle={styles.listContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                  />
                )
              ) : (
                isSearchingGlobal ? (
                  <View style={{ flex: 1, paddingTop: 4 }}>
                    <FoodSkeletonLoader count={5} />
                  </View>
                ) : globalResults.length === 0 ? (
                  <View style={styles.centerBox}>
                    <Ionicons name="globe-outline" size={48} color={textSecondary} />
                    <Text style={[styles.emptyTitle, { color: textPrimary }]}>
                      {searchQuery ? 'No global foods found' : 'Search USDA & Standard Foods'}
                    </Text>
                    <Text style={[styles.emptySub, { color: textSecondary }]}>
                      Type ingredients like 'egg', 'milk', 'dal', 'rice', 'chicken', 'paneer'...
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={globalResults}
                    keyExtractor={(item) => item.id}
                    renderItem={renderGlobalItem}
                    contentContainerStyle={styles.listContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                  />
                )
              )}
            </>
          )}
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
  sheetContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    height: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 4,
    marginBottom: 12,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabItemActive: {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  tabTextActive: {
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 20,
    gap: 8,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  foodRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  foodIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  foodEmoji: {
    fontSize: 20,
  },
  foodTextWrap: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  foodName: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  foodMacros: {
    fontSize: 12,
    marginTop: 2,
  },
  servingLabel: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 18,
  },
  createNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 16,
  },
  createNewBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  // Portion configuration styles
  portionContainer: {
    paddingBottom: 24,
    gap: 16,
  },
  selectedHeaderCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  selectedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedName: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  selectedBaseInfo: {
    fontSize: 13,
    marginTop: 4,
  },
  portionInputSection: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  portionInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  portionInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
  },
  unitText: {
    fontSize: 15,
    fontWeight: '500',
  },
  multipliersRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  multBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  multBtnActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  multBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  multBtnTextActive: {
    color: '#10B981',
  },
  helperNote: {
    fontSize: 12,
    marginTop: 4,
  },
  macrosCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  macroCalCol: {
    flex: 1.2,
    alignItems: 'center',
  },
  macroCalVal: {
    fontSize: 24,
    fontWeight: '800',
    color: '#10B981',
  },
  macroCalLbl: {
    fontSize: 12,
    marginTop: 2,
  },
  macroDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(148, 163, 184, 0.3)',
    marginHorizontal: 8,
  },
  macroNutrientCol: {
    flex: 1,
    alignItems: 'center',
  },
  nutrientVal: {
    fontSize: 15,
    fontWeight: '700',
  },
  nutrientLbl: {
    fontSize: 11,
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  backBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
