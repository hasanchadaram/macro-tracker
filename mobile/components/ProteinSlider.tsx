import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  PanResponder,
  LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { formatWeight, type ProteinBaselineInfo } from '@/lib/nutrition';

interface ProteinSliderProps {
  multiplier: number; // 1.6 to 2.2
  onMultiplierChange: (multiplier: number) => void;
  weightBaseline: number;
  baselineInfo?: ProteinBaselineInfo;
  recommendedMultiplier: number;
  isDark: boolean;
  totalGrams: number;
}

const MIN_MULTIPLIER = 1.6;
const MAX_MULTIPLIER = 2.2;
const PRESETS = [1.6, 1.8, 2.0, 2.2];

export function ProteinSlider({
  multiplier,
  onMultiplierChange,
  weightBaseline,
  baselineInfo,
  recommendedMultiplier,
  isDark,
  totalGrams,
}: ProteinSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const trackLayoutRef = useRef<{ x: number; width: number }>({ x: 0, width: 0 });
  const trackViewRef = useRef<View>(null);
  const lastHapticValueRef = useRef<number>(multiplier);

  const primaryColor = '#F43F5E';
  const trackBg = isDark ? '#334155' : '#E2E8F0';
  const cardBg = isDark ? 'rgba(30, 41, 59, 0.7)' : 'rgba(248, 250, 252, 0.9)';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';

  const clampedMultiplier = Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, multiplier));
  const progressRatio = (clampedMultiplier - MIN_MULTIPLIER) / (MAX_MULTIPLIER - MIN_MULTIPLIER);

  const handlePositionChange = (clientX: number) => {
    if (trackLayoutRef.current.width <= 0) return;
    const relX = clientX - trackLayoutRef.current.x;
    const ratio = Math.max(0, Math.min(1, relX / trackLayoutRef.current.width));
    const rawVal = MIN_MULTIPLIER + ratio * (MAX_MULTIPLIER - MIN_MULTIPLIER);
    // Round to 1 decimal place (or 0.05 step)
    const rounded = Math.round(rawVal * 20) / 20;
    const finalVal = Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, rounded));

    if (Math.abs(finalVal - lastHapticValueRef.current) >= 0.05) {
      lastHapticValueRef.current = finalVal;
      try {
        Haptics.selectionAsync();
      } catch (_) {}
    }
    onMultiplierChange(finalVal);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        handlePositionChange(evt.nativeEvent.pageX);
      },
      onPanResponderMove: (evt) => {
        handlePositionChange(evt.nativeEvent.pageX);
      },
      onPanResponderRelease: (evt) => {
        handlePositionChange(evt.nativeEvent.pageX);
      },
    })
  ).current;

  const onTrackLayout = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    setTrackWidth(width);
    if (trackViewRef.current) {
      trackViewRef.current.measure((_x, _y, measuredWidth, _height, pageX) => {
        trackLayoutRef.current = { x: pageX, width: measuredWidth || width };
      });
    }
  };

  const handlePresetSelect = (preset: number) => {
    lastHapticValueRef.current = preset;
    try {
      Haptics.selectionAsync();
    } catch (_) {}
    onMultiplierChange(preset);
  };

  // Helper description of the weight being used
  const renderBaselineContext = () => {
    if (!baselineInfo) {
      return (
        <Text style={[styles.baselineSubtext, { color: textSecondary }]}>
          Calculated against:{' '}
          <Text style={{ fontWeight: '700', color: primaryColor }}>
            {formatWeight(weightBaseline)} kg
          </Text>
        </Text>
      );
    }

    if (baselineInfo.alpha > 0 && baselineInfo.alpha < 1) {
      return (
        <Text style={[styles.baselineSubtext, { color: textSecondary }]}>
          Calculated against blended baseline of{' '}
          <Text style={{ fontWeight: '700', color: primaryColor }}>
            {formatWeight(baselineInfo.displayBaseline)} kg
          </Text>{' '}
          (smoothly transitioned toward target weight)
        </Text>
      );
    }

    if (baselineInfo.alpha === 1) {
      return (
        <Text style={[styles.baselineSubtext, { color: textSecondary }]}>
          Calculated against target weight of{' '}
          <Text style={{ fontWeight: '700', color: primaryColor }}>
            {formatWeight(baselineInfo.displayBaseline)} kg
          </Text>
        </Text>
      );
    }

    return (
      <Text style={[styles.baselineSubtext, { color: textSecondary }]}>
        Calculated against weight of{' '}
        <Text style={{ fontWeight: '700', color: primaryColor }}>
          {formatWeight(baselineInfo.displayBaseline)} kg
        </Text>
      </Text>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: cardBg, borderColor }]}>
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[styles.iconPill, { backgroundColor: `${primaryColor}20` }]}>
            <Ionicons name="barbell-outline" size={16} color={primaryColor} />
          </View>
          <Text style={[styles.title, { color: textPrimary }]}>Protein Target</Text>
        </View>

        <View style={[styles.multiplierBadge, { backgroundColor: `${primaryColor}18`, borderColor: `${primaryColor}40` }]}>
          <Text style={[styles.multiplierText, { color: primaryColor }]}>
            {clampedMultiplier.toFixed(1)} g/kg • {totalGrams}g
          </Text>
        </View>
      </View>

      <View style={styles.baselineBox}>
        <Ionicons name="information-circle-outline" size={15} color={primaryColor} style={{ marginTop: 1 }} />
        <View style={{ flex: 1, marginLeft: 6 }}>{renderBaselineContext()}</View>
      </View>

      {/* Interactive Slider Bar */}
      <View
        ref={trackViewRef}
        style={styles.sliderTouchArea}
        onLayout={onTrackLayout}
        {...panResponder.panHandlers}
      >
        <View style={[styles.trackBg, { backgroundColor: trackBg }]}>
          <View
            style={[
              styles.trackFill,
              {
                width: `${progressRatio * 100}%`,
                backgroundColor: primaryColor,
              },
            ]}
          />
        </View>
        
        {/* Slider Thumb */}
        <View
          style={[
            styles.thumb,
            {
              left: Math.max(0, Math.min(trackWidth - 24, progressRatio * trackWidth - 12)),
              borderColor: primaryColor,
              backgroundColor: '#FFFFFF',
            },
          ]}
        >
          <View style={[styles.thumbInner, { backgroundColor: primaryColor }]} />
        </View>
      </View>

      {/* Scale Labels */}
      <View style={styles.scaleLabelsRow}>
        <Text style={[styles.scaleLabel, { color: textSecondary }]}>1.6 g/kg</Text>
        <Text style={[styles.scaleLabel, { color: textSecondary }]}>1.9 g/kg</Text>
        <Text style={[styles.scaleLabel, { color: textSecondary }]}>2.2 g/kg</Text>
      </View>

      {/* Preset Pills */}
      <View style={styles.presetsRow}>
        {PRESETS.map((preset) => {
          const isSelected = Math.abs(clampedMultiplier - preset) < 0.04;
          const isRecommended = Math.abs(recommendedMultiplier - preset) < 0.04;

          return (
            <Pressable
              key={preset}
              onPress={() => handlePresetSelect(preset)}
              style={[
                styles.presetBtn,
                {
                  backgroundColor: isSelected ? primaryColor : isDark ? '#334155' : '#F1F5F9',
                  borderColor: isSelected ? primaryColor : borderColor,
                },
              ]}
            >
              <Text
                style={[
                  styles.presetText,
                  { color: isSelected ? '#FFFFFF' : textPrimary },
                ]}
              >
                {preset.toFixed(1)}g
              </Text>
              {isRecommended && (
                <View
                  style={[
                    styles.recBadge,
                    {
                      backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : `${primaryColor}20`,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.recBadgeText,
                      { color: isSelected ? '#FFFFFF' : primaryColor },
                    ]}
                  >
                    Rec
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Educational Note for Muscle Preservation */}
      <View style={[styles.infoNoteBox, { backgroundColor: isDark ? 'rgba(244, 63, 94, 0.12)' : 'rgba(244, 63, 94, 0.08)', borderColor: `${primaryColor}30` }]}>
        <Ionicons name="shield-checkmark" size={16} color={primaryColor} style={{ marginTop: 2 }} />
        <Text style={[styles.infoNoteText, { color: textPrimary }]}>
          {recommendedMultiplier === 2.0 ? (
            <>
              <Text style={{ fontWeight: '700', color: primaryColor }}>2.0 g/kg</Text> is recommended during weight loss to prevent muscle loss and protect your metabolic rate while in a deficit.
            </>
          ) : (
            <>
              <Text style={{ fontWeight: '700', color: primaryColor }}>1.6 g/kg</Text> provides the optimal amino acid supply for building new muscle tissue in a calorie surplus.
            </>
          )}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  iconPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  multiplierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  multiplierText: {
    fontSize: 13,
    fontWeight: '700',
  },
  baselineBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  baselineSubtext: {
    fontSize: 12,
    lineHeight: 16,
  },
  sliderTouchArea: {
    height: 36,
    justifyContent: 'center',
    position: 'relative',
  },
  trackBg: {
    height: 8,
    borderRadius: 4,
    width: '100%',
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 4,
  },
  thumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  thumbInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  scaleLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  scaleLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetText: {
    fontSize: 13,
    fontWeight: '600',
  },
  recBadge: {
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  recBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  infoNoteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 14,
    gap: 8,
  },
  infoNoteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
});
