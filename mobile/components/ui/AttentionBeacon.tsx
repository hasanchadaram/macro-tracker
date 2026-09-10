import React, { useEffect } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface AttentionBeaconProps {
  color: string;
  children: React.ReactNode;
  size?: number;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
  showHalo?: boolean;
}

export function AttentionBeacon({
  color,
  children,
  size = 28,
  active = true,
  style,
  showHalo = true,
}: AttentionBeaconProps) {
  const haloScale = useSharedValue(1);
  const haloOpacity = useSharedValue(0);
  const iconScale = useSharedValue(1);

  useEffect(() => {
    if (active) {
      if (showHalo) {
        // Expanding soft aura / halo ring
        haloScale.value = withRepeat(
          withSequence(
            withTiming(1, { duration: 0 }),
            withTiming(1.65, { duration: 750, easing: Easing.out(Easing.cubic) }),
            withTiming(1.65, { duration: 650 }) // resting pause
          ),
          -1,
          false
        );

        haloOpacity.value = withRepeat(
          withSequence(
            withTiming(0.55, { duration: 60 }),
            withTiming(0, { duration: 690, easing: Easing.out(Easing.quad) }),
            withTiming(0, { duration: 650 }) // resting pause
          ),
          -1,
          false
        );
      } else {
        haloScale.value = 1;
        haloOpacity.value = 0;
      }

      // Energetic, crisp double-pop rhythmic heartbeat (lively ~1.4s loop, not too slow)
      iconScale.value = withRepeat(
        withSequence(
          withTiming(1.20, { duration: 180, easing: Easing.out(Easing.quad) }),
          withTiming(1.05, { duration: 120, easing: Easing.inOut(Easing.quad) }),
          withTiming(1.24, { duration: 180, easing: Easing.out(Easing.quad) }),
          withTiming(1.0, { duration: 260, easing: Easing.inOut(Easing.quad) }),
          withTiming(1.0, { duration: 660 }) // resting pause
        ),
        -1,
        false
      );
    } else {
      haloScale.value = 1;
      haloOpacity.value = 0;
      iconScale.value = 1;
    }
  }, [active, showHalo]);

  const animatedHaloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: haloScale.value }],
    opacity: haloOpacity.value,
  }));

  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  return (
    <View style={[styles.container, style]}>
      {active && showHalo && (
        <Animated.View
          style={[
            styles.halo,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: color,
            },
            animatedHaloStyle,
          ]}
          pointerEvents="none"
        />
      )}
      <Animated.View style={[styles.iconWrapper, animatedIconStyle]}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
