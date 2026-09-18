import { useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  FlatList,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMyFoods } from '@/hooks/useMyFoods';
import { useAlert } from '@/components/ui/CustomAlert';
import { CreateFoodModal } from '@/components/CreateFoodModal';
import { FoodSkeletonLoader } from '@/components/ui/FoodSkeletonLoader';
import type { UserFood, NutritionPer100g } from '@/lib/types';

const SOURCE_ICONS: Record<string, { icon: string; color: string }> = {
  photo: { icon: 'camera', color: '#3B82F6' },
  describe: { icon: 'create', color: '#8B5CF6' },
  derived: { icon: 'git-branch', color: '#F59E0B' },
  manual: { icon: 'pencil', color: '#6B7280' },
};

export default function MyFoodsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { showAlert } = useAlert();

  const {
    myFoods,
    isLoading,
    searchMyFoods,
    searchGlobalFoods,
    createFood,
    deleteFood,
    refreshFoods,
  } = useMyFoods();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserFood[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);

  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const bgSurface = isDark ? '#1E293B' : '#FFFFFF';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const inputBg = isDark ? '#0F172A' : '#F1F5F9';

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback(
    (text: string) => {
      setSearchQuery(text);

      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

      if (!text.trim()) {
        setSearchResults(null);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      searchTimerRef.current = setTimeout(async () => {
        try {
          const results = await searchMyFoods(text.trim());
          setSearchResults(results);
        } catch {
          setSearchResults(null);
        } finally {
          setIsSearching(false);
        }
      }, 300);
    },
    [searchMyFoods]
  );

  const handleDelete = useCallback(
    (food: UserFood) => {
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
              } catch {
                showAlert('Error', 'Failed to delete food');
              }
            },
          },
        ]
      );
    },
    [deleteFood, showAlert]
  );

  const formatNutrition = (per100g: NutritionPer100g) => {
    return `${Math.round(per100g.calories)} kcal · ${per100g.protein_g.toFixed(1)}P · ${per100g.carbs_g.toFixed(1)}C · ${per100g.fat_g.toFixed(1)}F`;
  };

  const displayFoods = searchResults ?? myFoods;

  const renderFood = useCallback(
    ({ item }: { item: UserFood }) => {
      const sourceInfo = SOURCE_ICONS[item.source] || SOURCE_ICONS.manual;
      const isCompound = !!item.ingredients && item.ingredients.length > 0;

      return (
        <Pressable
          style={({ pressed }) => [
            styles.foodRow,
            { backgroundColor: bgSurface, borderColor },
            pressed && { opacity: 0.8 },
          ]}
          onPress={() => {
            Haptics.selectionAsync();
            router.push(`/my-foods/${item.id}` as any);
          }}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            handleDelete(item);
          }}
        >
          <View style={styles.foodLeft}>
            {/* Emoji or source icon */}
            <View style={[styles.foodIcon, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}>
              {item.emoji ? (
                <Text style={styles.foodEmoji}>{item.emoji}</Text>
              ) : (
                <Ionicons
                  name={sourceInfo.icon as any}
                  size={18}
                  color={sourceInfo.color}
                />
              )}
            </View>

            <View style={styles.foodInfo}>
              <View style={styles.foodNameRow}>
                <Text style={[styles.foodName, { color: textPrimary }]} numberOfLines={1}>
                  {item.name}
                </Text>
                {isCompound && (
                  <View style={[styles.compoundBadge, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)' }]}>
                    <Text style={styles.compoundBadgeText}>Recipe</Text>
                  </View>
                )}
              </View>

              <Text style={[styles.foodMacros, { color: textSecondary }]} numberOfLines={1}>
                {formatNutrition(item.per_100g)}
              </Text>

              {item.default_serving_label && (
                <Text style={[styles.foodServing, { color: textSecondary }]} numberOfLines={1}>
                  Serving: {item.default_serving_label}
                  {item.default_serving_g ? ` (${item.default_serving_g}g)` : ''}
                </Text>
              )}
            </View>
          </View>

          <Ionicons name="chevron-forward" size={18} color={textSecondary} />
        </Pressable>
      );
    },
    [bgSurface, borderColor, textPrimary, textSecondary, isDark, handleDelete, router]
  );

  const renderEmpty = () => {
    if (isLoading) return null;

    return (
      <View style={styles.emptyContainer}>
        <Ionicons
          name="restaurant-outline"
          size={48}
          color={textSecondary}
          style={{ marginBottom: 16 }}
        />
        <Text style={[styles.emptyTitle, { color: textPrimary }]}>
          {searchQuery ? 'No foods found' : 'Your food library is empty'}
        </Text>
        <Text style={[styles.emptySubtitle, { color: textSecondary }]}>
          {searchQuery
            ? `No foods matching "${searchQuery}"`
            : 'Create your first personal food to get started!'}
        </Text>
        {!searchQuery && (
          <Pressable
            style={styles.emptyButton}
            onPress={() => {
              Haptics.selectionAsync();
              setCreateModalVisible(true);
            }}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.emptyButtonText}>Create Food</Text>
          </Pressable>
        )}
      </View>
    );
  };

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
        <Text style={[styles.headerTitle, { color: textPrimary }]}>My Foods</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: inputBg, borderColor }]}>
        <Ionicons name="search" size={18} color={textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: textPrimary }]}
          placeholder="Search your foods..."
          placeholderTextColor={textSecondary}
          value={searchQuery}
          onChangeText={handleSearch}
          autoCorrect={false}
        />
        {isSearching && <ActivityIndicator size="small" color="#10B981" />}
        {searchQuery.length > 0 && !isSearching && (
          <Pressable
            onPress={() => {
              setSearchQuery('');
              setSearchResults(null);
            }}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={18} color={textSecondary} />
          </Pressable>
        )}
      </View>

      {/* Food count */}
      {!searchQuery && myFoods.length > 0 && (
        <Text style={[styles.countText, { color: textSecondary }]}>
          {myFoods.length} food{myFoods.length !== 1 ? 's' : ''} in your library
        </Text>
      )}

      {/* Food List */}
      {isLoading ? (
        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>
          <FoodSkeletonLoader count={6} />
        </View>
      ) : (
        <FlatList
          data={displayFoods}
          keyExtractor={(item) => item.id}
          renderItem={renderFood}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB */}
      <Pressable
        style={({ pressed }) => [
          styles.fab,
          pressed && { transform: [{ scale: 0.95 }] },
        ]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setCreateModalVisible(true);
        }}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </Pressable>

      {/* Create Food Modal */}
      <CreateFoodModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onSave={async (data) => {
          try {
            await createFood(data);
            setCreateModalVisible(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (err: any) {
            showAlert('Error', err.message || 'Failed to create food');
          }
        }}
        searchGlobalFoods={searchGlobalFoods}
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
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  countText: {
    fontSize: 13,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 100,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  foodLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  foodIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  foodEmoji: {
    fontSize: 20,
  },
  foodInfo: {
    flex: 1,
    gap: 2,
  },
  foodNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  foodName: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  compoundBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  compoundBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#F59E0B',
  },
  foodMacros: {
    fontSize: 12,
  },
  foodServing: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
});
