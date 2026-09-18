import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface FoodSkeletonLoaderProps {
  count?: number;
}

export function FoodSkeletonLoader({ count = 5 }: FoodSkeletonLoaderProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const pulseAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.75,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    return () => pulse.stop();
  }, [pulseAnim]);

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const blockColor = isDark ? '#334155' : '#E2E8F0';

  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, index) => (
        <Animated.View
          key={index}
          style={[
            styles.card,
            { backgroundColor: cardBg, borderColor, opacity: pulseAnim },
          ]}
        >
          {/* Icon Skeleton */}
          <View style={[styles.icon, { backgroundColor: blockColor }]} />

          {/* Text Content Skeleton */}
          <View style={styles.content}>
            {/* Title */}
            <View
              style={[
                styles.line,
                {
                  width: index % 2 === 0 ? '60%' : '48%',
                  height: 15,
                  backgroundColor: blockColor,
                  borderRadius: 6,
                },
              ]}
            />
            {/* Macros line */}
            <View
              style={[
                styles.line,
                {
                  width: '82%',
                  height: 11,
                  backgroundColor: blockColor,
                  borderRadius: 4,
                  marginTop: 6,
                },
              ]}
            />
            {/* Serving label line */}
            <View
              style={[
                styles.line,
                {
                  width: index % 2 === 0 ? '38%' : '50%',
                  height: 10,
                  backgroundColor: blockColor,
                  borderRadius: 4,
                  marginTop: 6,
                },
              ]}
            />
          </View>

          {/* Action icon placeholder */}
          <View style={[styles.actionBtn, { backgroundColor: blockColor }]} />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
    paddingVertical: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  line: {
    // Individual styling per block
  },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
});
