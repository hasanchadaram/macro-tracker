import React, { useState } from 'react';
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
  Image,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { RecentFood, FoodItem, MealTotals, UserFood, GlobalFood } from '@/lib/types';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveMealDraft, getMealDraft, clearMealDraft } from '@/lib/mealDraft';
import { useMyFoods } from '@/hooks/useMyFoods';
import { MyFoodPickerSheet } from '@/components/MyFoodPickerSheet';
import { CreateFoodModal } from '@/components/CreateFoodModal';

interface AddFoodModalProps {
  visible: boolean;
  mealType: string;
  recentFoods: RecentFood[];
  onClose: () => void;
  onAnalyze: (text?: string, imageBase64?: string, imageUri?: string, taggedFoods?: any[]) => void;
  onQuickAdd: (mealName: string, foods: FoodItem[], totals: MealTotals) => void;
  onRepeatYesterday: () => void;
}

export function AddFoodModal({
  visible,
  mealType,
  recentFoods,
  onClose,
  onAnalyze,
  onQuickAdd,
  onRepeatYesterday,
}: AddFoodModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [mode, setMode] = useState<'options' | 'describe'>('options');
  const [description, setDescription] = useState('');
  const [imageBase64, setImageBase64] = useState<string | undefined>(undefined);
  const [imageUri, setImageUri] = useState<string | undefined>(undefined);
  const [showTip, setShowTip] = useState(false);
  const [showFormatHint, setShowFormatHint] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerInitialFood, setPickerInitialFood] = useState<UserFood | null>(null);
  const [showCreateFood, setShowCreateFood] = useState(false);
  const [dismissedMentionIndex, setDismissedMentionIndex] = useState<number | null>(null);

  // Personal food library hook
  const { myFoods, topFoods, createFood, searchGlobalFoods, refreshFoods } = useMyFoods();

  // Identify all active registered personal foods present in current description (@FoodName or my FoodName)
  // If the user modifies even a single character of the food name, it automatically unregisters
  const registeredFoods = React.useMemo(() => {
    if (!description) return [];
    const lower = description.toLowerCase();
    const sorted = [...myFoods].sort((a, b) => b.name.length - a.name.length);
    return sorted.filter((f) => {
      const escaped = f.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(?:@|\\bmy\\s+)${escaped}(?!\\w)`, 'i');
      return pattern.test(lower);
    });
  }, [description, myFoods]);

  // Detect active @ or "my " mention query anywhere at current end of text, gracefully ignoring already registered food tags
  const getActiveMentionInfo = (
    text: string,
    activeFoods: UserFood[]
  ): { type: 'at' | 'my'; query: string; rawQuery: string; startIndex: number; queryStartIndex: number } | null => {
    const lastAtIndex = text.lastIndexOf('@');

    // Find last "\bmy\s+" match
    const myMatches = [...text.matchAll(/\bmy\s+/gi)];
    const lastMyMatch = myMatches.length > 0 ? myMatches[myMatches.length - 1] : null;

    let triggerType: 'at' | 'my' | null = null;
    let triggerIndex = -1;
    let queryStartIndex = -1;

    if (lastAtIndex !== -1 && (!lastMyMatch || lastAtIndex > (lastMyMatch.index ?? -1))) {
      triggerType = 'at';
      triggerIndex = lastAtIndex;
      queryStartIndex = lastAtIndex + 1;
    } else if (lastMyMatch && lastMyMatch.index !== undefined) {
      triggerType = 'my';
      triggerIndex = lastMyMatch.index;
      queryStartIndex = lastMyMatch.index + lastMyMatch[0].length;
    }

    if (!triggerType || triggerIndex === -1) return null;

    // If user explicitly dismissed suggestions for this specific trigger, don't show it
    if (dismissedMentionIndex === triggerIndex) return null;

    const textFromTrigger = text.slice(triggerIndex);

    // If the text from this trigger starts with any already-registered food name, it's completed!
    const isCompleted = activeFoods.some((food) => {
      const lowerName = food.name.toLowerCase();
      const lowerFrom = textFromTrigger.toLowerCase();
      const tag = triggerType === 'at' ? `@${lowerName}` : `my ${lowerName}`;
      return (
        lowerFrom === tag ||
        lowerFrom.startsWith(`${tag} `) ||
        lowerFrom.startsWith(`${tag},`) ||
        lowerFrom.startsWith(`${tag}.`)
      );
    });

    if (isCompleted) return null;

    const queryPart = text.slice(queryStartIndex);

    // If query has newline, sentence-ending punctuation, or is longer than 30 chars, don't show mention suggestions
    if (queryPart.includes('\n') || /[.!?]/.test(queryPart) || queryPart.length > 30) {
      return null;
    }

    // If query contains a space and no personal foods match or start with the query, dismiss it
    if (queryPart.includes(' ')) {
      const qTrim = queryPart.trim().toLowerCase();
      const qWords = qTrim.split(/\s+/).filter(Boolean);
      const hasMatch = myFoods.some((f) => {
        const name = f.name.toLowerCase();
        return name.includes(qTrim) || (qWords.length > 0 && qWords.every((w) => name.includes(w)));
      });
      if (!hasMatch) return null;
    }

    return {
      type: triggerType,
      query: queryPart.trim().toLowerCase(),
      rawQuery: queryPart,
      startIndex: triggerIndex,
      queryStartIndex,
    };
  };

  const mentionInfo = mode === 'describe' ? getActiveMentionInfo(description, registeredFoods) : null;

  // Personal foods only with smart plural/singular stemming & prefix matching
  const userMentionSuggestions = mentionInfo !== null
    ? myFoods.filter((f) => {
        if (!mentionInfo.query) return true;
        const q = mentionInfo.query.toLowerCase().trim();
        const name = f.name.toLowerCase();
        if (name.includes(q)) return true;
        const qWords = q.split(/\s+/).filter(Boolean);
        if (qWords.length > 1 && qWords.every((w) => name.includes(w))) return true;
        // Plural/singular normalization (e.g. 'eggs' -> 'egg', 'berries' -> 'berry', 'tomatoes' -> 'tomato')
        const stem = q.endsWith('ies')
          ? q.slice(0, -3) + 'y'
          : q.endsWith('es')
          ? q.slice(0, -2)
          : q.endsWith('s')
          ? q.slice(0, -1)
          : q;
        if (stem && name.includes(stem)) return true;
        const words = name.split(/[\s,.-]+/);
        return words.some((w) => w.startsWith(q) || (stem && w.startsWith(stem)));
      }).slice(0, 8)
    : [];

  const handleSelectMention = (food: UserFood) => {
    Haptics.selectionAsync();
    if (!mentionInfo) return;
    const beforeTrigger = description.slice(0, mentionInfo.startIndex);
    const queryLen = mentionInfo.rawQuery ? mentionInfo.rawQuery.length : 0;
    const afterQuery = description.slice(mentionInfo.queryStartIndex + queryLen);

    let insertTag = '';
    if (mentionInfo.type === 'at') {
      insertTag = `@${food.name}`;
    } else {
      // Preserve "my " casing (e.g. "my " or "My ")
      const userTypedMy = description.slice(mentionInfo.startIndex, mentionInfo.queryStartIndex);
      insertTag = `${userTypedMy}${food.name}`;
    }

    const updated = `${beforeTrigger}${insertTag} ${afterQuery.trimStart()}`;
    handleDescriptionChange(updated);
  };

  // Helper to render formatted text with registered personal food tags highlighted in emerald green
  // For "@Food", the entire "@Food" is highlighted green
  // For "my Food", "my " remains normal color and only "Food" is highlighted green
  const renderFormattedDescription = (
    text: string,
    activeFoods: UserFood[],
    primaryColor: string,
  ) => {
    if (!text) return null;
    if (activeFoods.length === 0) {
      return <Text style={{ color: primaryColor }}>{text}</Text>;
    }

    // Sort active foods by name length descending to avoid partial word collisions
    const sorted = [...activeFoods].sort((a, b) => b.name.length - a.name.length);
    const patterns = sorted.map((f) => {
      const esc = f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return `@${esc}|\\bmy\\s+${esc}`;
    });

    const regex = new RegExp(`(${patterns.join('|')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) => {
      if (!part) return null;

      // Check if part matches @Food
      if (part.startsWith('@')) {
        const isRegistered = activeFoods.some(
          (f) => part.toLowerCase() === `@${f.name.toLowerCase()}`
        );
        if (isRegistered) {
          return (
            <Text key={index} style={{ color: '#10B981', fontWeight: '700' }}>
              {part}
            </Text>
          );
        }
      }

      // Check if part matches "my Food"
      const myMatch = part.match(/^(\bmy\s+)(.*)$/i);
      if (myMatch) {
        const foodNameMatched = myMatch[2];
        const isRegistered = activeFoods.some(
          (f) => foodNameMatched.toLowerCase() === f.name.toLowerCase()
        );
        if (isRegistered) {
          return (
            <React.Fragment key={index}>
              <Text style={{ color: primaryColor }}>{myMatch[1]}</Text>
              <Text style={{ color: '#10B981', fontWeight: '700' }}>{foodNameMatched}</Text>
            </React.Fragment>
          );
        }
      }

      return (
        <Text key={index} style={{ color: primaryColor }}>
          {part}
        </Text>
      );
    });
  };

  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentMealTypeRef = React.useRef(mealType);
  const describeScrollRef = React.useRef<ScrollView>(null);

  // Auto-scroll describe mode to bottom so input and Analyze button are always visible above keyboard
  React.useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        if (mode === 'describe') {
          setTimeout(() => {
            describeScrollRef.current?.scrollToEnd({ animated: true });
          }, 80);
        }
      }
    );
    return () => {
      showSub.remove();
    };
  }, [mode]);

  // Sync / restore draft and refresh foods whenever modal opens or mealType changes
  React.useEffect(() => {
    let isMounted = true;
    if (visible) {
      refreshFoods();
    }
    if (visible && mealType) {
      checkTip();
      checkFormatHint();
      const mealTypeChanged = currentMealTypeRef.current !== mealType;
      currentMealTypeRef.current = mealType;

      getMealDraft(mealType).then((draft) => {
        if (!isMounted) return;
        if (draft && (draft.description || draft.imageUri)) {
          setDescription(draft.description || '');
          setImageUri(draft.imageUri);
          setImageBase64(undefined);
          setMode('describe');
        } else {
          setDescription('');
          setImageUri(undefined);
          setImageBase64(undefined);
          setMode('options');
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, [visible, mealType, refreshFoods]);

  // Clean up debounce timer on unmount to prevent leaks
  React.useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const checkTip = async () => {
    try {
      const hasSeen = await AsyncStorage.getItem('has_seen_add_food_tip');
      if (!hasSeen) {
        setShowTip(true);
      }
    } catch (e) {}
  };

  const dismissTip = async () => {
    setShowTip(false);
    try {
      await AsyncStorage.setItem('has_seen_add_food_tip', 'true');
    } catch (e) {}
  };

  const checkFormatHint = async () => {
    try {
      const hasSeen = await AsyncStorage.getItem('has_seen_format_hint');
      if (!hasSeen) {
        setShowFormatHint(true);
      }
    } catch (e) {}
  };

  const dismissFormatHint = async () => {
    setShowFormatHint(false);
    try {
      await AsyncStorage.setItem('has_seen_format_hint', 'true');
    } catch (e) {}
  };

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const inputBg = isDark ? '#0F172A' : '#F8FAFC';
  const buttonBg = isDark ? '#334155' : '#F1F5F9';

  const handleDescriptionChange = (text: string) => {
    setDescription(text);
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    // 400ms debounce saves disk I/O while keeping UI 60fps fluid
    saveTimerRef.current = setTimeout(() => {
      saveMealDraft(mealType, { description: text, imageUri });
    }, 400);
  };

  const updateImage = (uri?: string) => {
    setImageUri(uri);
    setImageBase64(undefined);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveMealDraft(mealType, { description, imageUri: uri });
  };

  const handleDiscardDraft = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    setDescription('');
    setImageUri(undefined);
    setImageBase64(undefined);
    clearMealDraft(mealType);
    setMode('options');
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Flush any pending text changes immediately before closing only if content actually exists
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      if (description.trim() || imageUri) {
        saveMealDraft(mealType, { description: description.trim(), imageUri });
      }
    }
    onClose();
  };

  const processImage = async (uri: string) => {
    try {
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 720 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG }
      );
      updateImage(manipResult.uri);
    } catch (error) {
      console.error("Image processing error:", error);
      alert("Failed to process image.");
    }
  };

  const handleScanPress = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (permissionResult.granted === false) {
      alert("You need to allow camera access to scan food.");
      return;
    }
    const pickerResult = await ImagePicker.launchCameraAsync({
      quality: 1, // Capture full quality, then compress specifically in ImageManipulator
    });
    if (!pickerResult.canceled && pickerResult.assets[0].uri) {
      await processImage(pickerResult.assets[0].uri);
      setMode('describe'); // Move to describe mode so they can add optional text or submit directly
    }
  };

  const handlePickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      alert("You need to allow gallery access to pick food images.");
      return;
    }
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      quality: 1,
    });
    if (!pickerResult.canceled && pickerResult.assets[0].uri) {
      await processImage(pickerResult.assets[0].uri);
      setMode('describe');
    }
  };

  const hasImage = !!imageUri || !!imageBase64;
  const hasContent = !!description.trim() || hasImage;

  const handleSubmitDescribe = () => {
    if (hasContent) {
      // Flush draft save so it's persisted during scan
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveMealDraft(mealType, { description: description.trim(), imageUri });
      }
      onAnalyze(description.trim(), imageBase64, imageUri, registeredFoods);
      // Close modal to let scan loader show, but keep draft intact until meal is saved
      onClose();
    }
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        style={styles.overlay}
      >
        <Pressable style={styles.topSpacer} onPress={handleClose} />
        <View style={[styles.modalContent, { backgroundColor: cardBg }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: textPrimary }]}>Add to {mealType}</Text>
            <Pressable onPress={handleClose}>
              <Ionicons name="close" size={24} color={textSecondary} />
            </Pressable>
          </View>

          {mode === 'options' && showTip && (
            <View style={[styles.tipBox, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
              <Ionicons name="information-circle" size={24} color="#3B82F6" style={{ marginTop: 2 }} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.tipText, { color: textPrimary }]}>
                  Results will be more accurate if you attach a photo and describe the items!
                </Text>
              </View>
              <Pressable onPress={dismissTip} style={{ padding: 4 }}>
                <Ionicons name="close" size={20} color={textSecondary} />
              </Pressable>
            </View>
          )}

          {mode === 'options' ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              {hasContent && (
                <View style={[styles.draftBanner, { backgroundColor: buttonBg, borderColor }]}>
                  <View style={styles.draftBannerLeft}>
                    <Ionicons name="document-text-outline" size={22} color="#10B981" />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.draftBannerTitle, { color: textPrimary }]}>
                        Draft for {mealType}
                      </Text>
                      <Text style={[styles.draftBannerSub, { color: textSecondary }]} numberOfLines={1}>
                        {description ? `"${description}"` : 'Photo attached'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.draftBannerActions}>
                    <Pressable
                      style={styles.resumeDraftBtn}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setMode('describe');
                      }}
                    >
                      <Text style={styles.resumeDraftBtnText}>Resume</Text>
                    </Pressable>
                    <Pressable
                      style={styles.discardDraftIconBtn}
                      onPress={handleDiscardDraft}
                      hitSlop={8}
                    >
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </Pressable>
                  </View>
                </View>
              )}

              <View style={styles.optionsGrid}>
                {/* Search / Describe (Text) */}
                <Pressable
                  style={[styles.optionCard, { backgroundColor: buttonBg, borderColor }]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setMode('describe');
                  }}
                >
                  <Ionicons name="text-outline" size={28} color="#10B981" />
                  <Text style={[styles.optionTitle, { color: textPrimary }]}>Describe meal</Text>
                  <Text style={[styles.optionSub, { color: textSecondary }]}>Type what you ate</Text>
                </Pressable>

                {/* Scan (Camera) */}
                <Pressable
                  style={[styles.optionCard, { backgroundColor: buttonBg, borderColor }]}
                  onPress={handleScanPress}
                >
                  <Ionicons name="camera-outline" size={28} color="#10B981" />
                  <Text style={[styles.optionTitle, { color: textPrimary }]}>Scan meal</Text>
                  <Text style={[styles.optionSub, { color: textSecondary }]}>Use camera</Text>
                </Pressable>
              </View>

              {/* My Foods Library Section */}
              <View style={[styles.myFoodsSection, { borderColor }]}>
                <View style={styles.myFoodsHeader}>
                  <View style={styles.myFoodsHeaderLeft}>
                    <Ionicons name="book-outline" size={17} color="#10B981" />
                    <Text style={[styles.myFoodsTitle, { color: textPrimary }]}>My Foods</Text>
                  </View>
                  <Pressable
                    style={styles.browseAllBtn}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setPickerInitialFood(null);
                      setShowPicker(true);
                    }}
                    hitSlop={8}
                  >
                    <Text style={styles.browseAllText}>Browse all</Text>
                    <Ionicons name="chevron-forward" size={14} color="#10B981" />
                  </Pressable>
                </View>

                {topFoods.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipsRow}
                  >
                    {topFoods.map((food) => (
                      <Pressable
                        key={food.id}
                        style={({ pressed }) => [
                          styles.foodChip,
                          { backgroundColor: buttonBg, borderColor },
                          pressed && { opacity: 0.75 },
                        ]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setPickerInitialFood(food);
                          setShowPicker(true);
                        }}
                      >
                        {food.emoji ? (
                          <Text style={styles.chipEmoji}>{food.emoji}</Text>
                        ) : (
                          <Ionicons name="restaurant-outline" size={14} color="#10B981" style={{ marginRight: 4 }} />
                        )}
                        <Text style={[styles.chipName, { color: textPrimary }]} numberOfLines={1}>
                          {food.name}
                        </Text>
                        <Text style={[styles.chipCal, { color: textSecondary }]}>
                          {food.per_100g.calories} kcal
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : (
                  <Pressable
                    style={[styles.emptyMyFoodsCard, { backgroundColor: buttonBg }]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setPickerInitialFood(null);
                      setShowPicker(true);
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={18} color="#10B981" style={{ marginRight: 6 }} />
                    <Text style={[styles.emptyMyFoodsText, { color: textSecondary }]}>
                      Add or browse personal foods
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* Repeat Yesterday */}
              <Pressable
                style={({ pressed }) => [
                  styles.listOption,
                  { borderColor },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => {
                  onRepeatYesterday();
                  handleClose();
                }}
              >
                <View style={styles.listOptionLeft}>
                  <Ionicons name="repeat" size={22} color="#F59E0B" />
                  <Text style={[styles.listOptionTitle, { color: textPrimary }]}>Repeat yesterday</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={textSecondary} />
              </Pressable>

              {/* Recent Foods */}
              <View style={styles.recentSection}>
                <Text style={[styles.recentTitle, { color: textPrimary }]}>⭐ Recent foods</Text>
                {recentFoods.filter((r) => (r.total_calories || 0) > 0).length > 0 ? (
                  recentFoods
                    .filter((r) => (r.total_calories || 0) > 0)
                    .map((recent) => (
                      <Pressable
                        key={recent.id}
                        style={({ pressed }) => [
                          styles.recentRow,
                          { borderColor },
                          pressed && { opacity: 0.7 },
                        ]}
                        onPress={() => {
                          const validFoods = Array.isArray(recent.foods)
                            ? recent.foods.filter((f) => (f.calories || 0) > 0 && (f.quantity || 0) > 0)
                            : [];
                          if (validFoods.length === 0 || (recent.total_calories || 0) <= 0) return;

                          onQuickAdd(
                            recent.meal_name,
                            validFoods,
                            {
                              calories: recent.total_calories,
                              protein_g: recent.total_protein,
                              carbs_g: recent.total_carbs,
                              fat_g: recent.total_fat,
                            }
                          );
                          handleClose();
                        }}
                      >
                        <View style={styles.recentInfo}>
                          <Text style={[styles.recentName, { color: textPrimary }]}>
                            {recent.meal_name}
                          </Text>
                          <Text style={[styles.recentCal, { color: textSecondary }]}>
                            {recent.total_calories} kcal
                          </Text>
                        </View>
                        <View style={styles.addIconWrap}>
                          <Ionicons name="add" size={20} color="#10B981" />
                        </View>
                      </Pressable>
                    ))
                ) : (
                  <Text style={{ color: textSecondary, marginTop: 8, fontStyle: 'italic' }}>
                    No recent foods yet.
                  </Text>
                )}
              </View>
            </ScrollView>
          ) : (
            /* Describe Mode (Text + optional Image) */
            <ScrollView
              ref={describeScrollRef}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[
                styles.describeContainer,
                { paddingBottom: Platform.OS === 'ios' ? 40 : 20 },
              ]}
            >
              {/* 1. Take photo & Gallery */}
              <View style={styles.imageActions}>
                <Pressable
                  style={[styles.imageBtn, { backgroundColor: buttonBg }]}
                  onPress={handleScanPress}
                >
                  <Ionicons name="camera" size={20} color="#10B981" />
                  <Text style={[styles.imageBtnText, { color: textPrimary }]}>
                    {hasImage ? 'Retake Photo' : 'Take Photo'}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.imageBtn, { backgroundColor: buttonBg }]}
                  onPress={handlePickImage}
                >
                  <Ionicons name="image" size={20} color="#10B981" />
                  <Text style={[styles.imageBtnText, { color: textPrimary }]}>
                    Gallery
                  </Text>
                </Pressable>
              </View>

              {imageUri && (
                <View style={[styles.imagePreviewWrap, { backgroundColor: buttonBg, borderColor }]}>
                  <Image source={{ uri: imageUri }} style={styles.imageThumbnail} />
                  <View style={styles.imagePreviewDetails}>
                    <Text style={[styles.imageAttachedText, { color: textPrimary }]}>
                      Photo ready for analysis
                    </Text>
                    <Text style={[styles.imageAttachedSub, { color: textSecondary }]}>
                      Optional: add details below for higher accuracy
                    </Text>
                  </View>
                  <Pressable
                    style={styles.imageRemoveBtn}
                    onPress={() => {
                      updateImage(undefined);
                    }}
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle" size={22} color={textSecondary} />
                  </Pressable>
                </View>
              )}

              {/* 2. Searching results (@ mention suggestions) */}
              {mentionInfo !== null && userMentionSuggestions.length > 0 && (
                <View style={[styles.mentionContainer, { backgroundColor: buttonBg, borderColor }]}>
                  <View style={styles.mentionHeader}>
                    <View style={styles.mentionHeaderLeft}>
                      <Ionicons name={mentionInfo.type === 'at' ? 'at' : 'bookmark-outline'} size={13} color="#10B981" />
                      <Text style={[styles.mentionHeaderText, { color: textSecondary }]}>
                        Insert from My Foods {mentionInfo.query ? `for "${mentionInfo.query}"` : ''}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setDismissedMentionIndex(mentionInfo.startIndex)}
                      hitSlop={8}
                      style={styles.mentionCloseBtn}
                    >
                      <Ionicons name="close" size={14} color={textSecondary} />
                    </Pressable>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.mentionScroll}
                  >
                    {userMentionSuggestions.map((item) => (
                      <Pressable
                        key={`user-${item.id}`}
                        style={({ pressed }) => [
                          styles.mentionChip,
                          { backgroundColor: cardBg, borderColor: '#10B981' },
                          pressed && { opacity: 0.7 },
                        ]}
                        onPress={() => handleSelectMention(item)}
                      >
                        {item.emoji ? (
                          <Text style={{ marginRight: 2 }}>{item.emoji}</Text>
                        ) : (
                          <Ionicons name="bookmark" size={12} color="#10B981" />
                        )}
                        <Text style={[styles.mentionName, { color: textPrimary }]}>{item.name}</Text>
                        <Text style={[styles.mentionCal, { color: textSecondary }]}>
                          {item.per_100g.calories} kcal
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* 3. That hint (format guidance tip banner) */}
              {showFormatHint && (
                <View
                  style={[
                    styles.formatHintBanner,
                    {
                      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.06)',
                      borderColor: isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.2)',
                    },
                  ]}
                >
                  <Ionicons name="sparkles-outline" size={14} color="#10B981" />
                  <Text style={[styles.formatHintText, { color: textSecondary }]}>
                    Format: Type amount before <Text style={{ color: '#10B981', fontWeight: '600' }}>@food</Text> or <Text style={{ color: textPrimary, fontWeight: '600' }}>my <Text style={{ color: '#10B981' }}>food</Text></Text> (e.g.{' '}
                    <Text style={{ color: textPrimary, fontWeight: '500' }}>2 @Medium Egg</Text> or{' '}
                    <Text style={{ color: textPrimary, fontWeight: '500' }}>2 of my Medium Egg</Text>)
                  </Text>
                  <Pressable onPress={dismissFormatHint} hitSlop={8} style={styles.dismissHintBtn}>
                    <Ionicons name="close" size={16} color={textSecondary} />
                  </Pressable>
                </View>
              )}

              {/* 4. The input field (+ character counter) */}
              <View style={styles.inputSection}>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: inputBg, color: textPrimary, borderColor },
                    registeredFoods.length > 0 && { borderColor: '#10B981' },
                  ]}
                  placeholder={
                    hasImage
                      ? "Optional: e.g. 2 @Medium Egg, 2 of my Medium Egg, or 'I ate half'..."
                      : "e.g. 2 @Medium Egg, 2 of my Medium Egg, or 150g my Rice"
                  }
                  placeholderTextColor={textSecondary}
                  multiline
                  maxLength={160}
                  autoCapitalize="none"
                  onChangeText={handleDescriptionChange}
                  autoFocus={!hasImage}
                  onFocus={() => {
                    setTimeout(() => {
                      describeScrollRef.current?.scrollToEnd({ animated: true });
                    }, 100);
                  }}
                >
                  {renderFormattedDescription(description, registeredFoods, textPrimary)}
                </TextInput>

                <View style={styles.charCountRow}>
                  <Text style={{ fontSize: 11, color: description.length >= 140 ? '#F59E0B' : textSecondary }}>
                    {description.length}/160
                  </Text>
                </View>
              </View>

              {/* 5. Buttons - back, discard, and analyse */}
              <View style={styles.actionButtons}>
                <Pressable
                  style={[styles.backButton, { borderColor }]}
                  onPress={() => setMode('options')}
                >
                  <Text style={[styles.backButtonText, { color: textSecondary }]}>Back</Text>
                </Pressable>

                {hasContent && (
                  <Pressable
                    style={[styles.discardButton, { borderColor }]}
                    onPress={handleDiscardDraft}
                  >
                    <Ionicons name="trash-outline" size={16} color="#EF4444" style={{ marginRight: 4 }} />
                    <Text style={styles.discardButtonText}>Discard</Text>
                  </Pressable>
                )}

                <Pressable
                  style={[
                    styles.submitButton,
                    !hasContent && styles.submitButtonDisabled,
                  ]}
                  onPress={handleSubmitDescribe}
                  disabled={!hasContent}
                >
                  <Text style={styles.submitButtonText}>Analyze</Text>
                </Pressable>
              </View>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
      </Modal>

      {/* Food Picker Sheet */}
      {showPicker && (
        <MyFoodPickerSheet
          visible={showPicker}
          mealType={mealType}
          initialFood={pickerInitialFood}
          onClose={() => {
            setShowPicker(false);
            setPickerInitialFood(null);
          }}
          onSelectFood={(mealName, foods, totals) => {
            setShowPicker(false);
            setPickerInitialFood(null);
            onQuickAdd(mealName, foods, totals);
            handleClose();
          }}
          onCreateNew={() => {
            setShowPicker(false);
            setPickerInitialFood(null);
            setShowCreateFood(true);
          }}
        />
      )}

      {/* Create Food Modal */}
      {showCreateFood && (
        <CreateFoodModal
          visible={showCreateFood}
          onClose={() => setShowCreateFood(false)}
          onSave={async (data) => {
            await createFood(data);
            setShowCreateFood(false);
          }}
          searchGlobalFoods={searchGlobalFoods}
        />
      )}
    </>
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  tipBox: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  tipText: {
    fontSize: 14,
    lineHeight: 20,
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
    fontSize: 15,
    fontWeight: '600',
    marginTop: 8,
  },
  optionSub: {
    fontSize: 12,
    marginTop: 4,
  },
  listOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  listOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listOptionTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  recentSection: {
    marginTop: 20,
    paddingBottom: 20,
  },
  recentTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  recentInfo: {
    flex: 1,
  },
  recentName: {
    fontSize: 15,
    fontWeight: '500',
  },
  recentCal: {
    fontSize: 13,
    marginTop: 2,
  },
  addIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  describeContainer: {
    gap: 12,
  },
  imageActions: {
    flexDirection: 'row',
    gap: 12,
  },
  imageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  imageBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  imagePreviewWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  imageThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  imagePreviewDetails: {
    flex: 1,
    gap: 2,
  },
  imageAttachedText: {
    fontSize: 14,
    fontWeight: '600',
  },
  imageAttachedSub: {
    fontSize: 12,
  },
  imageRemoveBtn: {
    padding: 4,
  },
  formatHintBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  formatHintText: {
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  dismissHintBtn: {
    padding: 3,
    marginLeft: 2,
  },
  inputSection: {
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    minHeight: 85,
    textAlignVertical: 'top',
  },
  charCountRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  backButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  discardButton: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardButtonText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
  submitButton: {
    flex: 2,
    backgroundColor: '#10B981',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#6EE7B7',
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  draftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  draftBannerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  draftBannerTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  draftBannerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  draftBannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resumeDraftBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  resumeDraftBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  discardDraftIconBtn: {
    padding: 6,
  },
  myFoodsSection: {
    marginBottom: 16,
  },
  myFoodsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  myFoodsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  myFoodsTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  browseAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 2,
  },
  browseAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#10B981',
  },
  chipsRow: {
    gap: 8,
    paddingVertical: 4,
  },
  foodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  chipEmoji: {
    fontSize: 14,
  },
  chipName: {
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 120,
  },
  chipCal: {
    fontSize: 11,
    fontWeight: '500',
  },
  emptyMyFoodsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  emptyMyFoodsText: {
    fontSize: 13,
  },
  mentionContainer: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 8,
  },
  mentionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  mentionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  mentionCloseBtn: {
    padding: 2,
  },
  mentionHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  mentionScroll: {
    gap: 8,
  },
  mentionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  mentionName: {
    fontSize: 13,
    fontWeight: '600',
  },
  mentionCal: {
    fontSize: 11,
  },
});
