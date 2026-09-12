import AsyncStorage from '@react-native-async-storage/async-storage';

export interface MealDraft {
  description: string;
  imageUri?: string;
  updatedAt: number;
}

const DRAFT_PREFIX = '@meal_draft_';
const MAX_DRAFT_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours expiration

/**
 * Persists a lightweight meal draft to AsyncStorage.
 * Stores only text and local image file URI (never large base64 blobs).
 */
export async function saveMealDraft(
  mealType: string,
  draft: { description: string; imageUri?: string }
): Promise<void> {
  if (!mealType) return;
  try {
    const key = `${DRAFT_PREFIX}${mealType.toLowerCase()}`;
    // If draft is completely empty, remove it to save storage
    if (!draft.description.trim() && !draft.imageUri) {
      await AsyncStorage.removeItem(key);
      return;
    }
    const payload: MealDraft = {
      description: draft.description || '',
      imageUri: draft.imageUri,
      updatedAt: Date.now(),
    };
    await AsyncStorage.setItem(key, JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to save meal draft:', err);
  }
}

/**
 * Retrieves the persisted draft for a meal type.
 * Automatically clears and ignores drafts older than 24 hours.
 */
export async function getMealDraft(mealType: string): Promise<MealDraft | null> {
  if (!mealType) return null;
  try {
    const key = `${DRAFT_PREFIX}${mealType.toLowerCase()}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed: MealDraft = JSON.parse(raw);
    if (Date.now() - (parsed.updatedAt || 0) > MAX_DRAFT_AGE_MS) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn('Failed to get meal draft:', err);
    return null;
  }
}

/**
 * Clears the persisted draft for a meal type.
 */
export async function clearMealDraft(mealType: string): Promise<void> {
  if (!mealType) return;
  try {
    const key = `${DRAFT_PREFIX}${mealType.toLowerCase()}`;
    await AsyncStorage.removeItem(key);
  } catch (err) {
    console.warn('Failed to clear meal draft:', err);
  }
}
