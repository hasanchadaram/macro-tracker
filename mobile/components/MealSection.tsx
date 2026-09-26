import React from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { MealEntry } from '@/lib/types';

interface MealSectionProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  entries: MealEntry[];
  onAddPress: () => void;
  onDeleteEntry: (entry: MealEntry) => void;
  onEditEntry: (entry: MealEntry) => void;
}

const SMOOTH_EASING = Easing.bezier(0.25, 0.1, 0.25, 1.0);

export function MealSection({ title, icon, color, entries, onAddPress, onDeleteEntry, onEditEntry }: MealSectionProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [expanded, setExpanded] = React.useState(false);

  // Track actual content height for precise animations
  const contentHeight = React.useRef(0);
  const animHeight = useSharedValue(0);
  const animOpacity = useSharedValue(0);
  const chevronRotation = useSharedValue(0);

  const firstSwipeableRef = React.useRef<Swipeable>(null);
  const tipAnim = useSharedValue(0);
  const tipTimeout1 = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipTimeout2 = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissSwipeTip = React.useCallback((markSeen = true) => {
    if (tipTimeout1.current) {
      clearTimeout(tipTimeout1.current);
      tipTimeout1.current = null;
    }
    if (tipTimeout2.current) {
      clearTimeout(tipTimeout2.current);
      tipTimeout2.current = null;
    }
    tipAnim.value = withTiming(0, { duration: 250, easing: Easing.inOut(Easing.ease) });
    firstSwipeableRef.current?.close();
    if (markSeen) {
      AsyncStorage.setItem('has_seen_swipe_delete_tip_home', 'true').catch(() => {});
    }
  }, []);

  React.useEffect(() => {
    if (expanded && entries.length > 0) {
      checkSwipeTip();
    } else {
      dismissSwipeTip(false);
    }
    return () => {
      dismissSwipeTip(false);
    };
  }, [expanded]);

  const checkSwipeTip = async () => {
    try {
      const hasSeen = await AsyncStorage.getItem('has_seen_swipe_delete_tip_home');
      if (!hasSeen) {
        tipTimeout1.current = setTimeout(() => {
          if (firstSwipeableRef.current) {
            firstSwipeableRef.current.openRight();
            tipAnim.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });
            tipTimeout2.current = setTimeout(() => {
              dismissSwipeTip(true);
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

  const totalCalories = entries.reduce((sum, e) => sum + (e.calories || 0), 0);

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const entryBg = isDark ? '#0F172A' : '#F8FAFC';

  const toggleExpand = () => {
    const opening = !expanded;
    setExpanded(opening);

    if (opening) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const targetHeight = opening ? contentHeight.current : 0;
    animHeight.value = withTiming(targetHeight, { duration: 320, easing: SMOOTH_EASING });
    animOpacity.value = withTiming(opening ? 1 : 0, { duration: opening ? 280 : 200, easing: SMOOTH_EASING });
    chevronRotation.value = withTiming(opening ? 1 : 0, { duration: 280, easing: SMOOTH_EASING });
  };

  const handleContentLayout = (event: any) => {
    const { height } = event.nativeEvent.layout;
    if (height > 0) {
      contentHeight.current = height;
      // If currently expanded, update animated height to match new content
      if (expanded) {
        animHeight.value = withTiming(height, { duration: 250, easing: SMOOTH_EASING });
      }
    }
  };

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value * 180}deg` }],
    marginLeft: 4,
  }));

  const animatedContentStyle = useAnimatedStyle(() => ({
    height: animHeight.value,
    opacity: animOpacity.value,
    overflow: 'hidden' as const,
  }));

  return (
    <View style={[styles.container, { backgroundColor: cardBg, borderColor }]}>
      <Animated.View style={[styles.swipeTipBubble, animatedTipStyle]} pointerEvents="none">
        <Text style={styles.swipeTipText}>Swipe left to delete!</Text>
        <View style={styles.swipeTipArrow} />
      </Animated.View>

      {/* Section Header */}
      <Pressable style={styles.header} onPress={toggleExpand}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconWrap, { backgroundColor: color + '18' }]}>
            <Ionicons name={icon} size={20} color={color} />
          </View>
          <Text style={[styles.title, { color: textPrimary }]}>{title}</Text>
          {totalCalories > 0 && (
            <Text style={[styles.totalCal, { color: textSecondary }]}>
              ~{Math.round(totalCalories)} kcal
            </Text>
          )}
          <Animated.View style={chevronStyle}>
            <Ionicons name="chevron-down" size={16} color={textSecondary} />
          </Animated.View>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: color + '18' },
            pressed && { opacity: 0.7, transform: [{ scale: 0.92 }] },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onAddPress();
          }}
        >
          <Ionicons name="add" size={20} color={color} />
        </Pressable>
      </Pressable>

      {/* Animated content — height is measured and animated precisely */}
      <Animated.View style={animatedContentStyle}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }} onLayout={handleContentLayout}>
          {entries.length > 0 ? (
            <View style={styles.entriesList}>
              {entries.map((entry, index) => (
                <Swipeable
                  key={entry.id}
                  ref={index === 0 ? firstSwipeableRef : null}
                  onSwipeableWillOpen={() => dismissSwipeTip(true)}
                  renderRightActions={() => (
                    <Pressable
                      style={styles.deleteButton}
                      onPress={() => {
                        dismissSwipeTip(true);
                        onDeleteEntry(entry);
                      }}
                    >
                      <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
                    </Pressable>
                  )}
                >
                  <TouchableOpacity
                    style={[styles.entryRow, { backgroundColor: entryBg }]}
                    onPress={() => onEditEntry(entry)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.entryInfo}>
                      <Text style={[styles.entryName, { color: textPrimary }]} numberOfLines={1}>
                        {entry.title || entry.meal_name}
                      </Text>

                      <Text style={[styles.entryMacros, { color: textSecondary }]}>
                        Protein: {Math.round(entry.protein)}g • Carbs: {Math.round(entry.carbs)}g • Fat: {Math.round(entry.fat)}g
                      </Text>
                    </View>
                    <View style={styles.entryRowRight}>
                      <Text style={[styles.entryCal, { color: textPrimary }]}>
                        ~{Math.round(entry.calories || 0)} kcal
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={textSecondary} style={{ marginLeft: 4 }} />
                    </View>
                  </TouchableOpacity>
                </Swipeable>
              ))}
            </View>
          ) : (
            <Text style={[styles.emptyText, { color: textSecondary }]}>No meals logged yet</Text>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  totalCal: {
    fontSize: 13,
    fontWeight: '500',
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  entriesList: {
    marginTop: 12,
    gap: 8,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  entryInfo: {
    flex: 1,
  },
  entryName: {
    fontSize: 15,
    fontWeight: '600',
  },
  entryDesc: {
    fontSize: 13,
    marginTop: 2,
    fontStyle: 'italic',
  },
  entryMacros: {
    fontSize: 12,
    marginTop: 4,
  },
  entryRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  entryCal: {
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 12,
  },
  deleteButton: {
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 60,
    borderRadius: 12,
    marginLeft: 8,
  },
  swipeTipBubble: {
    position: 'absolute',
    top: 10,
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
  emptyText: {
    marginTop: 12,
    fontSize: 13,
    fontStyle: 'italic',
  },
});
