import { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMyFoods } from '@/hooks/useMyFoods';
import { useAlert } from '@/components/ui/CustomAlert';
import type { UserFood, NutritionPer100g, FoodIngredient } from '@/lib/types';

export default function FoodDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { showAlert } = useAlert();

  const { myFoods, updateFood, deleteFood } = useMyFoods();

  const [food, setFood] = useState<UserFood | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Edit fields
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editServingG, setEditServingG] = useState('');
  const [editServingLabel, setEditServingLabel] = useState('');
  const [editCalories, setEditCalories] = useState('');
  const [editProtein, setEditProtein] = useState('');
  const [editCarbs, setEditCarbs] = useState('');
  const [editFat, setEditFat] = useState('');
  const [editFiber, setEditFiber] = useState('');
  const [editSodium, setEditSodium] = useState('');

  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const bgSurface = isDark ? '#1E293B' : '#FFFFFF';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const inputBg = isDark ? '#0F172A' : '#F8FAFC';

  useEffect(() => {
    const found = myFoods.find(f => f.id === id);
    if (found) {
      setFood(found);
      populateEditFields(found);
    }
  }, [id, myFoods]);

  const populateEditFields = (f: UserFood) => {
    setEditName(f.name);
    setEditNotes(f.notes || '');
    setEditServingG(f.default_serving_g?.toString() || '');
    setEditServingLabel(f.default_serving_label || '');
    setEditCalories(f.per_100g.calories.toString());
    setEditProtein(f.per_100g.protein_g.toString());
    setEditCarbs(f.per_100g.carbs_g.toString());
    setEditFat(f.per_100g.fat_g.toString());
    setEditFiber(f.per_100g.fiber_g?.toString() || '');
    setEditSodium(f.per_100g.sodium_mg?.toString() || '');
  };

  const handleSave = async () => {
    if (!food || !editName.trim()) return;

    setIsSaving(true);
    try {
      const per100g: NutritionPer100g = {
        calories: parseFloat(editCalories) || 0,
        protein_g: parseFloat(editProtein) || 0,
        carbs_g: parseFloat(editCarbs) || 0,
        fat_g: parseFloat(editFat) || 0,
        fiber_g: editFiber ? parseFloat(editFiber) : undefined,
        sodium_mg: editSodium ? parseFloat(editSodium) : undefined,
      };

      await updateFood(food.id, {
        name: editName.trim(),
        per_100g: per100g,
        notes: editNotes.trim() || null,
        default_serving_g: editServingG ? parseFloat(editServingG) : null,
        default_serving_label: editServingLabel.trim() || null,
        source: food.source,
        ingredients: food.ingredients,
        derived_from_global: food.derived_from_global,
        derived_from_user: food.derived_from_user,
        ai_estimated: food.ai_estimated,
        ai_confidence: food.ai_confidence,
      });

      setIsEditing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      showAlert('Error', err.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!food) return;
    showAlert(
      `Delete "${food.name}"?`,
      'This will permanently remove this food from your library.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFood(food.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } catch {
              showAlert('Error', 'Failed to delete');
            }
          },
        },
      ]
    );
  };

  if (!food) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      </SafeAreaView>
    );
  }

  const isCompound = !!food.ingredients && food.ingredients.length > 0;

  const MacroRow = ({ label, value, unit, editValue, onChangeEdit }: {
    label: string; value: number; unit: string;
    editValue?: string; onChangeEdit?: (v: string) => void;
  }) => (
    <View style={[styles.macroRow, { borderColor }]}>
      <Text style={[styles.macroLabel, { color: textSecondary }]}>{label}</Text>
      {isEditing && onChangeEdit ? (
        <TextInput
          style={[styles.macroInput, { color: textPrimary, backgroundColor: inputBg, borderColor }]}
          value={editValue}
          onChangeText={onChangeEdit}
          keyboardType="decimal-pad"
        />
      ) : (
        <Text style={[styles.macroValue, { color: textPrimary }]}>
          {typeof value === 'number' ? value.toFixed(1) : '—'} {unit}
        </Text>
      )}
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}
      edges={['top']}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: textPrimary }]} numberOfLines={1}>
          {food.name}
        </Text>
        {isEditing ? (
          <Pressable onPress={handleSave} style={styles.headerAction} disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator size="small" color="#10B981" />
            ) : (
              <Text style={styles.saveText}>Save</Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setIsEditing(true);
            }}
            style={styles.headerAction}
          >
            <Ionicons name="pencil-outline" size={20} color="#10B981" />
          </Pressable>
        )}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Name (editable) */}
          {isEditing && (
            <View style={[styles.card, { backgroundColor: bgSurface, borderColor }]}>
              <Text style={[styles.sectionLabel, { color: textSecondary }]}>Name</Text>
              <TextInput
                style={[styles.textInput, { color: textPrimary, backgroundColor: inputBg, borderColor }]}
                value={editName}
                onChangeText={setEditName}
                maxLength={80}
              />
            </View>
          )}

          {/* Source & Lineage badge */}
          <View style={[styles.card, { backgroundColor: bgSurface, borderColor }]}>
            <View style={styles.badgeRow}>
              <View style={[styles.sourceBadge, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.08)' }]}>
                <Text style={styles.sourceBadgeText}>
                  {food.source === 'photo' ? '📷 From photo' :
                   food.source === 'describe' ? '✍️ Described' :
                   food.source === 'derived' ? '🔗 Derived' :
                   '✏️ Manual'}
                </Text>
              </View>
              {isCompound && (
                <View style={[styles.sourceBadge, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.08)' }]}>
                  <Text style={[styles.sourceBadgeText, { color: '#F59E0B' }]}>
                    🍳 Compound ({food.ingredients!.length} ingredients)
                  </Text>
                </View>
              )}
              {food.ai_estimated && (
                <View style={[styles.sourceBadge, { backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.08)' }]}>
                  <Text style={[styles.sourceBadgeText, { color: '#6366F1' }]}>
                    🤖 AI estimated
                    {food.ai_confidence ? ` (${Math.round(food.ai_confidence * 100)}%)` : ''}
                  </Text>
                </View>
              )}
            </View>

            {food.use_count > 0 && (
              <Text style={[styles.usageText, { color: textSecondary }]}>
                Used {food.use_count} time{food.use_count !== 1 ? 's' : ''}
                {food.last_used_at ? ` · Last: ${new Date(food.last_used_at).toLocaleDateString()}` : ''}
              </Text>
            )}
          </View>

          {/* Notes */}
          <View style={[styles.card, { backgroundColor: bgSurface, borderColor }]}>
            <Text style={[styles.sectionLabel, { color: textSecondary }]}>Notes</Text>
            {isEditing ? (
              <TextInput
                style={[styles.textInput, styles.notesInput, { color: textPrimary, backgroundColor: inputBg, borderColor }]}
                value={editNotes}
                onChangeText={setEditNotes}
                multiline
                placeholder="e.g. Less oil, no salt"
                placeholderTextColor={textSecondary}
              />
            ) : (
              <Text style={[styles.notesText, { color: food.notes ? textPrimary : textSecondary }]}>
                {food.notes || 'No notes'}
              </Text>
            )}
          </View>

          {/* Serving defaults */}
          <View style={[styles.card, { backgroundColor: bgSurface, borderColor }]}>
            <Text style={[styles.sectionLabel, { color: textSecondary }]}>Default Serving</Text>
            {isEditing ? (
              <View style={styles.servingEditRow}>
                <TextInput
                  style={[styles.servingInput, { color: textPrimary, backgroundColor: inputBg, borderColor }]}
                  value={editServingG}
                  onChangeText={setEditServingG}
                  keyboardType="decimal-pad"
                  placeholder="g"
                  placeholderTextColor={textSecondary}
                />
                <TextInput
                  style={[styles.servingInput, { flex: 2, color: textPrimary, backgroundColor: inputBg, borderColor }]}
                  value={editServingLabel}
                  onChangeText={setEditServingLabel}
                  placeholder="e.g. 1 bowl"
                  placeholderTextColor={textSecondary}
                />
              </View>
            ) : (
              <Text style={[styles.servingText, { color: textPrimary }]}>
                {food.default_serving_label
                  ? `${food.default_serving_label}${food.default_serving_g ? ` (${food.default_serving_g}g)` : ''}`
                  : food.default_serving_g
                    ? `${food.default_serving_g}g`
                    : 'Not set'}
              </Text>
            )}
          </View>

          {/* Nutrition per 100g */}
          <View style={[styles.card, { backgroundColor: bgSurface, borderColor }]}>
            <Text style={[styles.sectionLabel, { color: textSecondary }]}>Nutrition per 100g</Text>
            <MacroRow label="Calories" value={food.per_100g.calories} unit="kcal"
              editValue={editCalories} onChangeEdit={setEditCalories} />
            <MacroRow label="Protein" value={food.per_100g.protein_g} unit="g"
              editValue={editProtein} onChangeEdit={setEditProtein} />
            <MacroRow label="Carbs" value={food.per_100g.carbs_g} unit="g"
              editValue={editCarbs} onChangeEdit={setEditCarbs} />
            <MacroRow label="Fat" value={food.per_100g.fat_g} unit="g"
              editValue={editFat} onChangeEdit={setEditFat} />
            <MacroRow label="Fiber" value={food.per_100g.fiber_g ?? 0} unit="g"
              editValue={editFiber} onChangeEdit={setEditFiber} />
            <MacroRow label="Sodium" value={food.per_100g.sodium_mg ?? 0} unit="mg"
              editValue={editSodium} onChangeEdit={setEditSodium} />
          </View>

          {/* Ingredients (read-only, for compound foods) */}
          {isCompound && (
            <View style={[styles.card, { backgroundColor: bgSurface, borderColor }]}>
              <Text style={[styles.sectionLabel, { color: textSecondary }]}>Ingredients</Text>
              {food.ingredients!.map((ing: FoodIngredient, idx: number) => (
                <View key={idx} style={[styles.ingredientRow, { borderColor }]}>
                  <Text style={[styles.ingredientName, { color: textPrimary }]}>{ing.name}</Text>
                  <Text style={[styles.ingredientAmount, { color: textSecondary }]}>
                    {ing.amount_g}g
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Delete button */}
          <Pressable
            style={[styles.deleteButton, { borderColor: '#EF4444' }]}
            onPress={handleDelete}
          >
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
            <Text style={styles.deleteButtonText}>Delete Food</Text>
          </Pressable>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  headerAction: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveText: {
    color: '#10B981',
    fontWeight: '700',
    fontSize: 15,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  card: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  sourceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sourceBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#10B981',
  },
  usageText: {
    fontSize: 12,
    marginTop: 8,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
  },
  notesInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  notesText: {
    fontSize: 14,
    lineHeight: 20,
  },
  servingEditRow: {
    flexDirection: 'row',
    gap: 10,
  },
  servingInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
  },
  servingText: {
    fontSize: 15,
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  macroLabel: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  macroValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  macroInput: {
    width: 90,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    fontSize: 15,
    textAlign: 'right',
  },
  ingredientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
  },
  ingredientName: {
    fontSize: 14,
    fontWeight: '500',
  },
  ingredientAmount: {
    fontSize: 14,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    marginTop: 8,
  },
  deleteButtonText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '600',
  },
});
