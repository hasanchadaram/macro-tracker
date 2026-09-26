import React, { useState, useCallback, useEffect } from 'react';
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
  ActivityIndicator,
  Image,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAlert } from '@/components/ui/CustomAlert';
import { supabase } from '@/lib/supabase';
import type { CreateFoodParams } from '@/hooks/useMyFoods';
import type { GlobalFood, NutritionPer100g, FoodIngredient } from '@/lib/types';

interface CreateFoodModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: CreateFoodParams) => Promise<void>;
  searchGlobalFoods: (query: string) => Promise<GlobalFood[]>;
}

type Step = 'choose' | 'describe' | 'photo' | 'search' | 'review';

interface ResolvedFood {
  name: string;
  is_compound: boolean;
  per_100g: NutritionPer100g;
  default_serving_g: number;
  default_serving_label: string;
  ingredients: Array<{ name: string; amount_g: number }>;
  confidence: number;
  source: string;
}

export function CreateFoodModal({
  visible,
  onClose,
  onSave,
  searchGlobalFoods,
}: CreateFoodModalProps) {
  const router = useRouter();
  const { showAlert } = useAlert();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [step, setStep] = useState<Step>('choose');
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState<string | undefined>();
  const [isResolving, setIsResolving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasCustomKey, setHasCustomKey] = useState(false);

  useEffect(() => {
    if (visible) {
      const checkKey = async () => {
        try {
          const { data } = await supabase.rpc('get_ai_settings');
          if (data?.has_custom_key) {
            setHasCustomKey(true);
          }
        } catch {
          // ignore
        }
      };
      checkKey();
    }
  }, [visible]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GlobalFood[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedBase, setSelectedBase] = useState<GlobalFood | null>(null);
  const [tweakNote, setTweakNote] = useState('');

  // Review state (resolved from AI or selected base)
  const [resolvedFood, setResolvedFood] = useState<ResolvedFood | null>(null);
  const [editName, setEditName] = useState('');
  const [editCalories, setEditCalories] = useState('');
  const [editProtein, setEditProtein] = useState('');
  const [editCarbs, setEditCarbs] = useState('');
  const [editFat, setEditFat] = useState('');
  const [editFiber, setEditFiber] = useState('');
  const [editSodium, setEditSodium] = useState('');
  const [editServingG, setEditServingG] = useState('');
  const [editServingLabel, setEditServingLabel] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSource, setEditSource] = useState<'manual' | 'photo' | 'describe' | 'derived'>('manual');
  const [derivedFromGlobal, setDerivedFromGlobal] = useState<string | null>(null);

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const inputBg = isDark ? '#0F172A' : '#F8FAFC';
  const buttonBg = isDark ? '#334155' : '#F1F5F9';

  const reset = () => {
    setStep('choose');
    setDescription('');
    setImageUri(undefined);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedBase(null);
    setTweakNote('');
    setResolvedFood(null);
    setEditName('');
    setEditCalories('');
    setEditProtein('');
    setEditCarbs('');
    setEditFat('');
    setEditFiber('');
    setEditSodium('');
    setEditServingG('');
    setEditServingLabel('');
    setEditNotes('');
    setEditSource('manual');
    setDerivedFromGlobal(null);
    setIsResolving(false);
    setIsSaving(false);
  };

  const handleClose = () => {
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    reset();
    onClose();
  };

  const handleBackToChoose = () => {
    Keyboard.dismiss();
    Haptics.selectionAsync();
    setStep('choose');
  };

  // ── Photo handling (same as AddFoodModal) ───────────────────────────
  const processImage = async (uri: string) => {
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 720 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG }
      );
      setImageUri(result.uri);
    } catch {
      alert('Failed to process image.');
    }
  };

  const handleCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showAlert('Permission Required', 'Camera permission is needed to take a food photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (!result.canceled && result.assets[0].uri) {
      await processImage(result.assets[0].uri);
      if (step === 'choose') {
        setStep('photo');
      }
    }
  };

  const handleGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert('Permission Required', 'Gallery permission is needed to select a food photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
    if (!result.canceled && result.assets[0].uri) {
      await processImage(result.assets[0].uri);
      if (step === 'choose') {
        setStep('photo');
      }
    }
  };

  // ── Resolve food via edge function ──────────────────────────────────
  const callResolveFood = async (text?: string, imgUri?: string): Promise<ResolvedFood | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    const functionUrl = `${supabaseUrl}/functions/v1/resolve-food`;

    return new Promise(async (resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', functionUrl);

        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('apikey', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '');

        xhr.onload = () => {
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.success && response.data) {
              resolve(response.data as ResolvedFood);
            } else {
              const err: any = new Error(response.error || 'Failed to resolve food');
              err.is_daily_limit = response.is_daily_limit;
              err.rate_limited = response.rate_limited;
              reject(err);
            }
          } catch {
            reject(new Error('Invalid response'));
          }
        };

        xhr.onerror = () => reject(new Error('Network error'));
        xhr.ontimeout = () => reject(new Error('Request timed out'));

        if (imgUri) {
          const formData = new FormData();
          formData.append('image', {
            uri: imgUri,
            name: 'food.jpg',
            type: 'image/jpeg',
          } as any);
          if (text) formData.append('text', text);
          xhr.send(formData);
        } else {
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.send(JSON.stringify({ text }));
        }
      } catch (err) {
        reject(err);
      }
    });
  };

  const handleResolve = async (text?: string, imgUri?: string, source: 'describe' | 'photo' = 'describe') => {
    setIsResolving(true);
    try {
      const result = await callResolveFood(text, imgUri);
      if (result) {
        setResolvedFood(result);
        setEditName(result.name);
        setEditCalories(result.per_100g.calories.toString());
        setEditProtein(result.per_100g.protein_g.toString());
        setEditCarbs(result.per_100g.carbs_g.toString());
        setEditFat(result.per_100g.fat_g.toString());
        setEditFiber(result.per_100g.fiber_g?.toString() || '');
        setEditSodium(result.per_100g.sodium_mg?.toString() || '');
        setEditServingG(result.default_serving_g?.toString() || '');
        setEditServingLabel(result.default_serving_label || '');
        setEditSource(source);
        setStep('review');
      }
    } catch (err: any) {
      if (hasCustomKey) {
        showAlert(
          'Food Analysis Failed',
          `${err.message || 'Failed to analyze food.'}\n\nYou can wait a moment and try again, or switch to a different AI model in your Profile settings.`,
          [
            {
              text: 'Change Model',
              onPress: () => {
                handleClose();
                router.push('/settings');
              },
            },
            { text: 'OK', style: 'cancel' },
          ]
        );
      } else {
        const isDaily = err?.is_daily_limit || err.message?.includes('daily limit') || err.message?.includes('Daily AI quota') || err.message?.includes('add your own API key');
        if (isDaily) {
          showAlert(
            'Daily Limit Reached',
            err.message || 'Daily limit reached.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Settings',
                onPress: () => {
                  handleClose();
                  router.push('/settings');
                },
              },
            ]
          );
          return;
        }
        showAlert('Food Analysis Failed', err.message || 'Failed to analyze food.');
      }
    } finally {
      setIsResolving(false);
    }
  };

  // ── Search global foods ─────────────────────────────────────────────
  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchInput = (text: string) => {
    setSearchQuery(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!text.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchGlobalFoods(text.trim());
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  };

  const handleSelectBase = (food: GlobalFood) => {
    setSelectedBase(food);
    setDerivedFromGlobal(food.id);
    setEditName(food.name);
    setEditCalories(food.per_100g.calories.toString());
    setEditProtein(food.per_100g.protein_g.toString());
    setEditCarbs(food.per_100g.carbs_g.toString());
    setEditFat(food.per_100g.fat_g.toString());
    setEditFiber(food.per_100g.fiber_g?.toString() || '');
    setEditSodium(food.per_100g.sodium_mg?.toString() || '');
    setEditServingG('');
    setEditServingLabel('');
    setEditSource('derived');
    setStep('review');
  };

  // ── Save ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!editName.trim()) return;

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

      // Build ingredients from resolved food if compound
      let ingredients: FoodIngredient[] | null = null;
      if (resolvedFood?.is_compound && resolvedFood.ingredients.length > 0) {
        // For now, ingredients from AI don't have food_ids (they need matching to global_foods)
        // Store them with empty food_ids as a best-effort; detail screen will show names
        ingredients = resolvedFood.ingredients.map(ing => ({
          food_id: '',     // will be populated by future matching logic
          food_table: 'global' as const,
          name: ing.name,
          amount_g: ing.amount_g,
        }));
      }

      await onSave({
        name: editName.trim(),
        per_100g: per100g,
        source: editSource,
        notes: editNotes.trim() || null,
        default_serving_g: editServingG ? parseFloat(editServingG) : null,
        default_serving_label: editServingLabel.trim() || null,
        ingredients,
        derived_from_global: derivedFromGlobal,
        ai_estimated: !!resolvedFood,
        ai_confidence: resolvedFood?.confidence || null,
      });

      reset();
    } catch (err: any) {
      // Error handled by parent
    } finally {
      setIsSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────
  const renderMacroInput = (label: string, value: string, onChangeText: (v: string) => void, unit: string) => (
    <View style={[styles.macroInputRow, { borderColor }]}>
      <Text style={[styles.macroLabel, { color: textSecondary }]}>{label}</Text>
      <View style={styles.macroInputRight}>
        <TextInput
          style={[styles.macroInput, { color: textPrimary, backgroundColor: inputBg, borderColor }]}
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          selectTextOnFocus
        />
        <Text style={[styles.macroUnit, { color: textSecondary }]}>{unit}</Text>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        key={step}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        enabled={step !== 'choose'}
        style={styles.overlay}
      >
        <Pressable style={styles.topSpacer} onPress={handleClose} />
        <View style={[styles.modalContent, { backgroundColor: cardBg }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: textPrimary }]}>
              {step === 'choose' ? 'Create My Food' :
               step === 'describe' ? 'Describe Food' :
               step === 'photo' ? 'Photo Analysis' :
               step === 'search' ? 'Start from Existing' :
               'Review & Save'}
            </Text>
            <Pressable onPress={handleClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={textSecondary} />
            </Pressable>
          </View>

          {/* ── Step: Choose Method ──────────────────────────────────── */}
          {step === 'choose' && (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.optionsGrid}>
                <Pressable
                  style={[styles.optionCard, { backgroundColor: buttonBg, borderColor }]}
                  onPress={handleCamera}
                >
                  <Ionicons name="camera-outline" size={28} color="#3B82F6" />
                  <Text style={[styles.optionTitle, { color: textPrimary }]}>Take a photo</Text>
                  <Text style={[styles.optionSub, { color: textSecondary }]}>AI analyzes the food</Text>
                </Pressable>

                <Pressable
                  style={[styles.optionCard, { backgroundColor: buttonBg, borderColor }]}
                  onPress={() => { Haptics.selectionAsync(); setStep('describe'); }}
                >
                  <Ionicons name="create-outline" size={28} color="#8B5CF6" />
                  <Text style={[styles.optionTitle, { color: textPrimary }]}>Describe it</Text>
                  <Text style={[styles.optionSub, { color: textSecondary }]}>Type what it is</Text>
                </Pressable>
              </View>

              <Pressable
                style={[styles.listOption, { borderColor }]}
                onPress={() => { Haptics.selectionAsync(); setStep('search'); }}
              >
                <View style={styles.listOptionLeft}>
                  <Ionicons name="search-outline" size={22} color="#10B981" />
                  <View>
                    <Text style={[styles.listOptionTitle, { color: textPrimary }]}>Start from existing</Text>
                    <Text style={[styles.listOptionSub, { color: textSecondary }]}>Browse global foods, then customize</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={textSecondary} />
              </Pressable>

              <Pressable
                style={[styles.listOption, { borderColor }]}
                onPress={() => {
                  Haptics.selectionAsync();
                  // Go straight to review with empty fields for manual entry
                  setEditSource('manual');
                  setStep('review');
                }}
              >
                <View style={styles.listOptionLeft}>
                  <Ionicons name="pencil-outline" size={22} color="#6B7280" />
                  <View>
                    <Text style={[styles.listOptionTitle, { color: textPrimary }]}>Enter manually</Text>
                    <Text style={[styles.listOptionSub, { color: textSecondary }]}>Type all values yourself</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={textSecondary} />
              </Pressable>
            </ScrollView>
          )}

          {/* ── Step: Describe ──────────────────────────────────────── */}
          {step === 'describe' && (
            <ScrollView 
              showsVerticalScrollIndicator={false} 
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.stepContainer}
            >
              <Text style={[styles.hint, { color: textSecondary }]}>
                Describe the food item — what it is, how it's prepared
              </Text>
              <TextInput
                style={[styles.describeInput, { color: textPrimary, backgroundColor: inputBg, borderColor }]}
                placeholder='e.g. "My palakura pappu, mostly toor dal, around 10% palak, normal oil"'
                placeholderTextColor={textSecondary}
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={200}
                autoFocus
              />

              {/* Attached Image or Attach Photo Buttons */}
              {imageUri ? (
                <View style={styles.attachedImageWrapper}>
                  <Image source={{ uri: imageUri }} style={styles.attachedImageThumbnail} />
                  <Pressable
                    style={styles.removeImageButton}
                    onPress={() => setImageUri(undefined)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Remove attached photo"
                  >
                    <Ionicons name="close-circle" size={24} color="#EF4444" />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.attachPhotoRow}>
                  <Pressable
                    style={[styles.attachPhotoBtn, { backgroundColor: buttonBg, borderColor }]}
                    onPress={handleCamera}
                  >
                    <Ionicons name="camera-outline" size={18} color="#10B981" />
                    <Text style={[styles.attachPhotoBtnText, { color: textPrimary }]}>Take Photo</Text>
                  </Pressable>

                  <Pressable
                    style={[styles.attachPhotoBtn, { backgroundColor: buttonBg, borderColor }]}
                    onPress={handleGallery}
                  >
                    <Ionicons name="images-outline" size={18} color="#3B82F6" />
                    <Text style={[styles.attachPhotoBtnText, { color: textPrimary }]}>Choose Photo</Text>
                  </Pressable>
                </View>
              )}

              <View style={styles.actionRow}>
                <Pressable style={[styles.backBtn, { borderColor }]} onPress={handleBackToChoose}>
                  <Text style={[styles.backBtnText, { color: textSecondary }]}>Back</Text>
                </Pressable>
                <Pressable
                  style={[styles.analyzeBtn, (!description.trim() && !imageUri) && styles.analyzeBtnDisabled]}
                  onPress={() => handleResolve(description.trim() || undefined, imageUri, imageUri ? 'photo' : 'describe')}
                  disabled={(!description.trim() && !imageUri) || isResolving}
                >
                  {isResolving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.analyzeBtnText}>Analyze</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          )}

          {/* ── Step: Photo ─────────────────────────────────────────── */}
          {step === 'photo' && (
            <ScrollView 
              showsVerticalScrollIndicator={false} 
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.stepContainer}
            >
              {imageUri && (
                <Image source={{ uri: imageUri }} style={styles.photoPreview} />
              )}
              <TextInput
                style={[styles.describeInput, { color: textPrimary, backgroundColor: inputBg, borderColor }]}
                placeholder="Optional: describe what this is (e.g. 'My omelette with olive oil')"
                placeholderTextColor={textSecondary}
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={200}
              />
              <View style={styles.actionRow}>
                <Pressable style={[styles.backBtn, { borderColor }]} onPress={handleBackToChoose}>
                  <Text style={[styles.backBtnText, { color: textSecondary }]}>Back</Text>
                </Pressable>
                <Pressable
                  style={[styles.analyzeBtn, !imageUri && styles.analyzeBtnDisabled]}
                  onPress={() => handleResolve(description.trim() || undefined, imageUri, 'photo')}
                  disabled={!imageUri || isResolving}
                >
                  {isResolving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.analyzeBtnText}>Analyze</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          )}

          {/* ── Step: Search Existing ───────────────────────────────── */}
          {step === 'search' && (
            <View style={styles.stepContainer}>
              <View style={styles.searchHeaderRow}>
                <View style={[styles.searchBar, { backgroundColor: inputBg, borderColor, flex: 1 }]}>
                  <Ionicons name="search" size={18} color={textSecondary} />
                  <TextInput
                    style={[styles.searchInput, { color: textPrimary }]}
                    placeholder="Search foods (e.g. toor dal, olive oil)"
                    placeholderTextColor={textSecondary}
                    value={searchQuery}
                    onChangeText={handleSearchInput}
                    autoFocus
                  />
                  {isSearching && <ActivityIndicator size="small" color="#10B981" />}
                </View>
                <Pressable style={[styles.backBtn, { borderColor, paddingVertical: 10, paddingHorizontal: 14 }]} onPress={handleBackToChoose}>
                  <Text style={[styles.backBtnText, { color: textSecondary }]}>Back</Text>
                </Pressable>
              </View>

              <ScrollView style={styles.searchResults} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {searchResults.map((food) => (
                  <Pressable
                    key={food.id}
                    style={({ pressed }) => [
                      styles.searchResultRow,
                      { borderColor },
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      handleSelectBase(food);
                    }}
                  >
                    <View style={styles.searchResultInfo}>
                      <Text style={[styles.searchResultName, { color: textPrimary }]}>{food.name}</Text>
                      <Text style={[styles.searchResultMacros, { color: textSecondary }]}>
                        {Math.round(food.per_100g.calories)} kcal · {food.per_100g.protein_g}P · {food.per_100g.carbs_g}C · {food.per_100g.fat_g}F per 100g
                      </Text>
                    </View>
                    <Ionicons name="add-circle" size={24} color="#10B981" />
                  </Pressable>
                ))}

                {searchQuery && !isSearching && searchResults.length === 0 && (
                  <Text style={[styles.noResults, { color: textSecondary }]}>
                    No foods found for "{searchQuery}"
                  </Text>
                )}
              </ScrollView>

              <Pressable style={[styles.backBtn, { borderColor, alignSelf: 'flex-start', marginTop: 12 }]} onPress={() => setStep('choose')}>
                <Text style={[styles.backBtnText, { color: textSecondary }]}>Back</Text>
              </Pressable>
            </View>
          )}

          {/* ── Step: Review & Save ─────────────────────────────────── */}
          {step === 'review' && (
            <ScrollView showsVerticalScrollIndicator={false} style={styles.reviewScroll}>
              {/* Derived badge */}
              {derivedFromGlobal && selectedBase && (
                <View style={[styles.derivedBadge, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.06)' }]}>
                  <Ionicons name="git-branch" size={16} color="#10B981" />
                  <Text style={[styles.derivedText, { color: textPrimary }]}>
                    Derived from <Text style={{ fontWeight: '700' }}>{selectedBase.name}</Text>
                  </Text>
                </View>
              )}

              {resolvedFood?.is_compound && resolvedFood.ingredients.length > 0 && (
                <View style={[styles.compoundBanner, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.06)' }]}>
                  <Text style={[styles.compoundBannerText, { color: '#F59E0B' }]}>
                    🍳 Compound food — {resolvedFood.ingredients.length} ingredients detected
                  </Text>
                </View>
              )}

              {/* Attached food photo preview if available */}
              {imageUri && (
                <View style={[styles.reviewPhotoCard, { borderColor }]}>
                  <Image source={{ uri: imageUri }} style={styles.reviewPhotoPreview} />
                </View>
              )}

              {/* Name */}
              <Text style={[styles.fieldLabel, { color: textSecondary }]}>Food Name</Text>
              <TextInput
                style={[styles.fieldInput, { color: textPrimary, backgroundColor: inputBg, borderColor }]}
                value={editName}
                onChangeText={setEditName}
                placeholder="My Palakura Pappu"
                placeholderTextColor={textSecondary}
              />

              {/* Serving */}
              <Text style={[styles.fieldLabel, { color: textSecondary }]}>Default Serving</Text>
              <View style={styles.servingRow}>
                <TextInput
                  style={[styles.fieldInput, { flex: 1, color: textPrimary, backgroundColor: inputBg, borderColor }]}
                  value={editServingG}
                  onChangeText={setEditServingG}
                  placeholder="150"
                  placeholderTextColor={textSecondary}
                  keyboardType="decimal-pad"
                />
                <Text style={[styles.servingUnit, { color: textSecondary }]}>g</Text>
                <TextInput
                  style={[styles.fieldInput, { flex: 2, color: textPrimary, backgroundColor: inputBg, borderColor }]}
                  value={editServingLabel}
                  onChangeText={setEditServingLabel}
                  placeholder="1 bowl"
                  placeholderTextColor={textSecondary}
                />
              </View>

              {/* Notes */}
              <Text style={[styles.fieldLabel, { color: textSecondary }]}>Notes</Text>
              <TextInput
                style={[styles.fieldInput, { color: textPrimary, backgroundColor: inputBg, borderColor }]}
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="e.g. less oil, no salt"
                placeholderTextColor={textSecondary}
              />

              {/* Nutrition per 100g */}
              <Text style={[styles.fieldLabel, { color: textSecondary, marginTop: 12 }]}>Nutrition per 100g</Text>
              {renderMacroInput('Calories', editCalories, setEditCalories, 'kcal')}
              {renderMacroInput('Protein', editProtein, setEditProtein, 'g')}
              {renderMacroInput('Carbs', editCarbs, setEditCarbs, 'g')}
              {renderMacroInput('Fat', editFat, setEditFat, 'g')}
              {renderMacroInput('Fiber', editFiber, setEditFiber, 'g')}
              {renderMacroInput('Sodium', editSodium, setEditSodium, 'mg')}

              {/* Ingredients (read-only from AI) */}
              {resolvedFood?.is_compound && resolvedFood.ingredients.length > 0 && (
                <>
                  <Text style={[styles.fieldLabel, { color: textSecondary, marginTop: 12 }]}>Ingredients (AI estimate)</Text>
                  {resolvedFood.ingredients.map((ing, idx) => (
                    <View key={idx} style={[styles.ingredientRow, { borderColor }]}>
                      <Text style={[styles.ingredientName, { color: textPrimary }]}>{ing.name}</Text>
                      <Text style={[styles.ingredientAmt, { color: textSecondary }]}>{ing.amount_g}g</Text>
                    </View>
                  ))}
                </>
              )}

              {/* Action buttons */}
              <View style={styles.reviewActions}>
                <Pressable style={[styles.backBtn, { borderColor }]} onPress={() => setStep('choose')}>
                  <Text style={[styles.backBtnText, { color: textSecondary }]}>Back</Text>
                </Pressable>
                <Pressable
                  style={[styles.saveBtn, !editName.trim() && styles.analyzeBtnDisabled]}
                  onPress={handleSave}
                  disabled={!editName.trim() || isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="bookmark" size={18} color="#FFFFFF" />
                      <Text style={styles.saveBtnText}>Save to My Foods</Text>
                    </>
                  )}
                </Pressable>
              </View>

              <View style={{ height: 30 }} />
            </ScrollView>
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
  topSpacer: {
    flex: 1,
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: Platform.OS === 'ios' ? 24 : 14,
    maxHeight: '94%',
    width: '100%',
  },
  searchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  optionsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  optionCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  optionSub: {
    fontSize: 11,
    marginTop: 4,
  },
  listOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  listOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  listOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  listOptionSub: {
    fontSize: 12,
    marginTop: 2,
  },
  stepContainer: {
    gap: 12,
  },
  hint: {
    fontSize: 14,
  },
  describeInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  backBtn: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  analyzeBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyzeBtnDisabled: {
    opacity: 0.5,
  },
  analyzeBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
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
  searchResults: {
    maxHeight: 300,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  searchResultInfo: {
    flex: 1,
    marginRight: 12,
  },
  searchResultName: {
    fontSize: 15,
    fontWeight: '600',
  },
  searchResultMacros: {
    fontSize: 12,
    marginTop: 2,
  },
  noResults: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
    fontStyle: 'italic',
  },
  reviewScroll: {
    maxHeight: 500,
  },
  derivedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
  },
  derivedText: {
    fontSize: 13,
  },
  compoundBanner: {
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
  },
  compoundBannerText: {
    fontSize: 13,
    fontWeight: '500',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 8,
  },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginBottom: 4,
  },
  servingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  servingUnit: {
    fontSize: 14,
    fontWeight: '500',
  },
  macroInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
  },
  macroLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  macroInputRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  macroInput: {
    width: 80,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    fontSize: 15,
    textAlign: 'right',
  },
  macroUnit: {
    fontSize: 13,
    width: 30,
  },
  ingredientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
  },
  ingredientName: {
    fontSize: 14,
  },
  ingredientAmt: {
    fontSize: 14,
  },
  reviewActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  attachedImageWrapper: {
    position: 'relative',
    alignSelf: 'flex-start',
    marginTop: 10,
    marginBottom: 6,
    borderRadius: 12,
    overflow: 'hidden',
  },
  attachedImageThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 12,
  },
  removeImageButton: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  attachPhotoRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    marginBottom: 6,
  },
  attachPhotoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  attachPhotoBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  reviewPhotoCard: {
    width: '100%',
    height: 120,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 14,
  },
  reviewPhotoPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
});
