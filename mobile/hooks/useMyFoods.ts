import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import type { UserFood, GlobalFood, NutritionPer100g, FoodIngredient } from '@/lib/types';

const USER_FOODS_CACHE_KEY = 'cached_user_foods';

interface UseMyFoodsReturn {
  myFoods: UserFood[];
  isLoading: boolean;
  error: string | null;
  searchMyFoods: (query: string) => Promise<UserFood[]>;
  searchGlobalFoods: (query: string) => Promise<GlobalFood[]>;
  createFood: (data: CreateFoodParams) => Promise<UserFood | null>;
  updateFood: (id: string, data: CreateFoodParams) => Promise<UserFood | null>;
  deleteFood: (id: string) => Promise<boolean>;
  recordUse: (id: string) => Promise<void>;
  refreshFoods: () => Promise<void>;
  topFoods: UserFood[];  // top 3 by use_count for chip row
}

export interface CreateFoodParams {
  name: string;
  per_100g: NutritionPer100g;
  source?: 'manual' | 'photo' | 'describe' | 'derived';
  notes?: string | null;
  emoji?: string | null;
  default_serving_g?: number | null;
  default_serving_label?: string | null;
  ingredients?: FoodIngredient[] | null;
  derived_from_global?: string | null;
  derived_from_user?: string | null;
  ai_estimated?: boolean;
  ai_confidence?: number | null;
}

export function useMyFoods(): UseMyFoodsReturn {
  const [myFoods, setMyFoods] = useState<UserFood[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Initial instant load from persistent local disk cache
  useEffect(() => {
    AsyncStorage.getItem(USER_FOODS_CACHE_KEY).then((cached) => {
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMyFoods(parsed);
            setIsLoading(false);
          }
        } catch {}
      }
    });
  }, []);

  const fetchFoods = useCallback(async () => {
    try {
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error: fetchErr } = await supabase
        .from('user_foods')
        .select('*')
        .eq('user_id', user.id)
        .order('last_used_at', { ascending: false, nullsFirst: false })
        .limit(100);

      if (fetchErr) throw fetchErr;
      const foods = (data as UserFood[]) || [];
      setMyFoods(foods);
      // Update local storage cache
      AsyncStorage.setItem(USER_FOODS_CACHE_KEY, JSON.stringify(foods)).catch(() => {});
    } catch (err: any) {
      setError(err.message || 'Failed to load foods');
      console.error('useMyFoods fetchFoods error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFoods();
  }, [fetchFoods]);

  const searchMyFoods = useCallback(async (query: string): Promise<UserFood[]> => {
    if (!query.trim()) return myFoods;

    const q = query.toLowerCase().trim();
    const qWords = q.split(/\s+/).filter(Boolean);
    const localFiltered = myFoods.filter((f) => {
      const name = f.name.toLowerCase();
      if (name.includes(q)) return true;
      if (qWords.length > 1 && qWords.every((w) => name.includes(w))) return true;
      const words = name.split(/[\s,.-]+/);
      return words.some((w) => w.startsWith(q));
    });

    if (localFiltered.length > 0) {
      return localFiltered;
    }

    try {
      const { data, error: err } = await supabase
        .rpc('search_my_foods', { p_query: query.trim(), p_limit: 20 });

      if (err) throw err;
      return (data as UserFood[]) || [];
    } catch (err: any) {
      console.error('searchMyFoods error:', err);
      return localFiltered;
    }
  }, [myFoods]);

  const searchGlobalFoods = useCallback(async (query: string): Promise<GlobalFood[]> => {
    if (!query.trim()) return [];

    try {
      const { data, error: err } = await supabase
        .rpc('search_global_foods', { p_query: query.trim(), p_limit: 20 });

      if (err) throw err;
      return (data as GlobalFood[]) || [];
    } catch (err: any) {
      console.error('searchGlobalFoods error:', err);
      return [];
    }
  }, []);

  const createFood = useCallback(async (params: CreateFoodParams): Promise<UserFood | null> => {
    try {
      const { data, error: err } = await supabase.rpc('upsert_user_food', {
        p_name: params.name,
        p_per_100g: params.per_100g,
        p_source: params.source || 'manual',
        p_notes: params.notes || null,
        p_emoji: params.emoji || null,
        p_default_serving_g: params.default_serving_g || null,
        p_default_serving_label: params.default_serving_label || null,
        p_ingredients: params.ingredients || null,
        p_derived_from_global: params.derived_from_global || null,
        p_derived_from_user: params.derived_from_user || null,
        p_ai_estimated: params.ai_estimated || false,
        p_ai_confidence: params.ai_confidence || null,
        p_food_id: null,
      });

      if (err) throw err;

      const result = data as { success: boolean; food_id: string; food: UserFood };
      if (result?.success && result.food) {
        setMyFoods(prev => {
          const updated = [result.food, ...prev];
          AsyncStorage.setItem(USER_FOODS_CACHE_KEY, JSON.stringify(updated)).catch(() => {});
          return updated;
        });
        return result.food;
      }
      return null;
    } catch (err: any) {
      console.error('createFood error:', err);
      throw err;
    }
  }, []);

  const updateFood = useCallback(async (id: string, params: CreateFoodParams): Promise<UserFood | null> => {
    try {
      const { data, error: err } = await supabase.rpc('upsert_user_food', {
        p_name: params.name,
        p_per_100g: params.per_100g,
        p_source: params.source || 'manual',
        p_notes: params.notes || null,
        p_emoji: params.emoji || null,
        p_default_serving_g: params.default_serving_g || null,
        p_default_serving_label: params.default_serving_label || null,
        p_ingredients: params.ingredients || null,
        p_derived_from_global: params.derived_from_global || null,
        p_derived_from_user: params.derived_from_user || null,
        p_ai_estimated: params.ai_estimated || false,
        p_ai_confidence: params.ai_confidence || null,
        p_food_id: id,
      });

      if (err) throw err;

      const result = data as { success: boolean; food_id: string; food: UserFood };
      if (result?.success && result.food) {
        setMyFoods(prev => {
          const updated = prev.map(f => f.id === id ? result.food : f);
          AsyncStorage.setItem(USER_FOODS_CACHE_KEY, JSON.stringify(updated)).catch(() => {});
          return updated;
        });
        return result.food;
      }
      return null;
    } catch (err: any) {
      console.error('updateFood error:', err);
      throw err;
    }
  }, []);

  const deleteFood = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { data, error: err } = await supabase.rpc('delete_user_food', {
        p_food_id: id,
      });

      if (err) throw err;

      const result = data as { success: boolean };
      if (result?.success) {
        setMyFoods(prev => {
          const updated = prev.filter(f => f.id !== id);
          AsyncStorage.setItem(USER_FOODS_CACHE_KEY, JSON.stringify(updated)).catch(() => {});
          return updated;
        });
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('deleteFood error:', err);
      throw err;
    }
  }, []);

  const recordUse = useCallback(async (id: string): Promise<void> => {
    try {
      await supabase.rpc('record_food_use', { p_food_id: id });

      // Optimistic update
      setMyFoods(prev => prev.map(f =>
        f.id === id
          ? { ...f, use_count: f.use_count + 1, last_used_at: new Date().toISOString() }
          : f
      ));
    } catch (err: any) {
      console.error('recordUse error:', err);
    }
  }, []);

  // Top 3 most-used foods for chip row in AddFoodModal
  const topFoods = myFoods
    .filter(f => f.use_count > 0)
    .sort((a, b) => b.use_count - a.use_count)
    .slice(0, 3);

  return {
    myFoods,
    isLoading,
    error,
    searchMyFoods,
    searchGlobalFoods,
    createFood,
    updateFood,
    deleteFood,
    recordUse,
    refreshFoods: fetchFoods,
    topFoods,
  };
}
