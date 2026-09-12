import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { formatWeight } from '@/lib/nutrition';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ChartData {
  date: string;
  label: string;
  calories: number;
  weight: number | null;
}

interface CombinedChartProps {
  data: ChartData[];
  targetCalories: number;
  isDark: boolean;
  checkInDates?: string[];
}

export function CombinedChart({ data, targetCalories, isDark, checkInDates }: CombinedChartProps) {
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

  const PADDING_HORIZONTAL = 20;
  const CHART_HEIGHT = 200;
  // Account for parent padding (e.g. 20 on each side)
  const CHART_WIDTH = SCREEN_WIDTH - 80; 

  const N = data.length;
  if (N === 0) return null;

  // --- Scaling Logic ---
  // Calories
  const maxCal = Math.max(targetCalories, ...data.map(d => d.calories)) * 1.1 || 2500;
  
  // Weight
  const validWeights = data.map(d => d.weight).filter(w => w !== null) as number[];
  const minW = validWeights.length > 0 ? Math.min(...validWeights) : 70;
  const maxW = validWeights.length > 0 ? Math.max(...validWeights) : 70;
  
  // Responsive padding: tight buffer so small weight fluctuations (e.g. +0.25kg) produce a clearly visible rise
  const weightSpread = maxW - minW;
  const weightPadding = weightSpread > 0 
    ? Math.max(0.12, Math.min(0.8, weightSpread * 0.25))
    : 0.8;
  const weightMin = minW - weightPadding;
  const weightMax = maxW + weightPadding;
  const weightRange = weightMax - weightMin || 1.6;

  // --- Helpers for coordinates ---
  const getX = (index: number) => (index / Math.max(1, N - 1)) * CHART_WIDTH;
  const getCalY = (cal: number) => CHART_HEIGHT - (cal / maxCal) * CHART_HEIGHT;
  const getWeightY = (w: number) => CHART_HEIGHT - ((w - weightMin) / weightRange) * CHART_HEIGHT;

  // --- Line Renderer ---
  const renderLineSegment = (
    x1: number, y1: number, 
    x2: number, y2: number, 
    color: string, 
    key: string,
    thickness: number = 2
  ) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;

    return (
      <View
        key={key}
        style={{
          position: 'absolute',
          width: length,
          height: thickness,
          backgroundColor: color,
          left: centerX - length / 2,
          top: centerY - thickness / 2,
          transform: [{ rotate: `${angle}deg` }],
          borderRadius: thickness / 2,
        }}
      />
    );
  };

  // Determine x-axis milestone labels to show (3 on mobile, 4 on wide screens to guarantee zero overlap)
  const maxLabels = CHART_WIDTH >= 340 ? 4 : 3;
  const labelIndices: number[] = [];
  if (N <= 2) {
    for (let i = 0; i < N; i++) labelIndices.push(i);
  } else if (N === 3) {
    labelIndices.push(0, 1, 2);
  } else {
    const count = Math.min(maxLabels, N);
    for (let k = 0; k < count; k++) {
      const idx = Math.round((k / (count - 1)) * (N - 1));
      if (!labelIndices.includes(idx)) {
        labelIndices.push(idx);
      }
    }
  }

  return (
    <View style={styles.container}>
      {/* Chart Area */}
      <View style={[styles.chartArea, { width: CHART_WIDTH, height: CHART_HEIGHT }]}>
        
        {/* Horizontal Grid Lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((perc, i) => (
          <View 
            key={`grid-${i}`} 
            style={[styles.gridLine, { top: CHART_HEIGHT * perc, backgroundColor: gridColor }]} 
          />
        ))}

        {/* Target Calorie Line */}
        <View 
          style={[
            styles.targetLine, 
            { 
              top: getCalY(targetCalories),
              borderColor: textSecondary,
            }
          ]} 
        />

        {/* Check-In Vertical Lines */}
        {checkInDates && checkInDates.length > 0 && data.map((d, i) => {
          if (!checkInDates.includes(d.date)) return null;
          const x = getX(i);
          return (
            <React.Fragment key={`checkin-${d.date}-${i}`}>
              <View
                style={{
                  position: 'absolute',
                  left: x,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  borderLeftWidth: 1,
                  borderColor: isDark ? 'rgba(99, 102, 241, 0.45)' : 'rgba(99, 102, 241, 0.4)',
                  borderStyle: 'dashed',
                  zIndex: 1,
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  left: x - 2,
                  top: 2,
                  width: 5,
                  height: 5,
                  borderRadius: 2.5,
                  backgroundColor: '#6366F1',
                  zIndex: 3,
                }}
              />
            </React.Fragment>
          );
        })}

        {/* Calorie Line & Points */}
        {data.map((d, i) => {
          if (i === N - 1) return null;
          const next = data[i + 1];
          return renderLineSegment(getX(i), getCalY(d.calories), getX(i + 1), getCalY(next.calories), '#F43F5E', `cal-line-${i}`, 2.5);
        })}
        {data.map((d, i) => (
          <View
            key={`cal-dot-${i}`}
            style={[
              styles.dot, 
              { 
                left: getX(i) - 4, 
                top: getCalY(d.calories) - 4, 
                backgroundColor: '#F43F5E',
                borderColor: isDark ? '#1E293B' : '#FFF'
              }
            ]}
          />
        ))}

        {/* Weight Line & Points */}
        {data.map((d, i) => {
          if (i === N - 1 || d.weight === null) return null;
          
          // Find next valid weight
          let nextI = i + 1;
          while (nextI < N && data[nextI].weight === null) nextI++;
          if (nextI >= N) return null;

          const next = data[nextI];
          // Render bold, smooth blue line
          return renderLineSegment(getX(i), getWeightY(d.weight), getX(nextI), getWeightY(next.weight as number), '#60A5FA', `w-line-${i}`, 3);
        })}
        {data.map((d, i) => {
          if (d.weight === null) return null;
          return (
            <View
              key={`w-dot-${i}`}
              style={[
                styles.dot, 
                { 
                  left: getX(i) - 4.5, 
                  top: getWeightY(d.weight) - 4.5, 
                  width: 9,
                  height: 9,
                  borderRadius: 4.5,
                  backgroundColor: '#60A5FA',
                  borderColor: isDark ? '#1E293B' : '#FFF'
                }
              ]}
            />
          );
        })}

        {/* Weight Floating Tags */}
        {validWeights.length > 0 && (() => {
          const firstIdx = data.findIndex(d => d.weight !== null);
          const lastIdx = data.map(d => d.weight !== null).lastIndexOf(true);
          if (lastIdx === -1) return null;
          const currentWeight = data[lastIdx].weight as number;
          const firstWeight = firstIdx !== -1 ? (data[firstIdx].weight as number) : currentWeight;
          const weightDiff = currentWeight - firstWeight;
          const hasChanged = Math.abs(weightDiff) >= 0.05 && firstIdx !== lastIdx;

          const lastX = getX(lastIdx);
          const lastY = getWeightY(currentWeight);

          return (
            <>
              {/* Show starting weight milestone if weight changed across the window */}
              {hasChanged && firstIdx !== -1 && (
                <View
                  key="first-weight-tag"
                  style={{
                    position: 'absolute',
                    left: Math.max(0, Math.min(CHART_WIDTH - 65, getX(firstIdx) - 20)),
                    top: Math.max(0, Math.min(CHART_HEIGHT - 26, getWeightY(firstWeight) - 24)),
                    backgroundColor: isDark ? 'rgba(30, 41, 59, 0.92)' : 'rgba(255, 255, 255, 0.95)',
                    borderColor: textSecondary,
                    borderWidth: 1,
                    borderRadius: 6,
                    paddingHorizontal: 5,
                    paddingVertical: 2,
                    elevation: 2,
                  }}
                >
                  <Text style={{ fontSize: 9.5, fontWeight: '600', color: textSecondary }}>
                    {formatWeight(firstWeight)} kg
                  </Text>
                </View>
              )}

              {/* Latest Weight Floating Tag */}
              <View
                key="latest-weight-tag"
                style={{
                  position: 'absolute',
                  left: Math.max(0, Math.min(CHART_WIDTH - 72, lastX - 36)),
                  top: Math.max(0, Math.min(CHART_HEIGHT - 26, lastY - 24)),
                  backgroundColor: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.98)',
                  borderColor: '#60A5FA',
                  borderWidth: 1.5,
                  borderRadius: 6,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  shadowColor: '#60A5FA',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.25,
                  shadowRadius: 3,
                  elevation: 3,
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#60A5FA' }}>
                  {formatWeight(currentWeight)} kg{hasChanged ? ` (${weightDiff > 0 ? '+' : ''}${formatWeight(weightDiff)})` : ''}
                </Text>
              </View>
            </>
          );
        })()}
      </View>

      {/* X-Axis Milestone Labels */}
      <View style={[styles.xAxis, { width: CHART_WIDTH }]}>
        {labelIndices.map((idx) => {
          const d = data[idx];
          if (!d) return null;
          const LABEL_WIDTH = 54;
          const isFirst = idx === 0;
          const isLast = idx === N - 1;

          let leftPos: number;
          let textAlign: 'left' | 'center' | 'right';
          if (isFirst) {
            leftPos = 0;
            textAlign = 'left';
          } else if (isLast) {
            leftPos = CHART_WIDTH - LABEL_WIDTH;
            textAlign = 'right';
          } else {
            leftPos = Math.max(0, Math.min(CHART_WIDTH - LABEL_WIDTH, getX(idx) - LABEL_WIDTH / 2));
            textAlign = 'center';
          }

          return (
            <Text 
              key={`label-${idx}`} 
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={[
                styles.xLabel, 
                { 
                  color: textSecondary,
                  position: 'absolute',
                  left: leftPos,
                  width: LABEL_WIDTH,
                  textAlign,
                }
              ]}
            >
              {d.label}
            </Text>
          );
        })}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#F43F5E' }]} />
          <Text style={[styles.legendText, { color: textPrimary }]}>Calories</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#60A5FA' }]} />
          <Text style={[styles.legendText, { color: textPrimary }]}>Weight</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: textSecondary }]} />
          <Text style={[styles.legendText, { color: textPrimary }]}>Target Cal</Text>
        </View>
        {checkInDates && checkInDates.length > 0 && (
          <View style={styles.legendItem}>
            <View style={{ width: 10, height: 1, borderTopWidth: 1, borderColor: '#6366F1', borderStyle: 'dashed' }} />
            <Text style={[styles.legendText, { color: textPrimary }]}>Check-In</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
    alignItems: 'center',
  },
  chartArea: {
    position: 'relative',
    marginHorizontal: 20,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
  },
  targetLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    zIndex: 1,
  },
  dot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    zIndex: 2,
  },
  xAxis: {
    height: 22,
    marginTop: 8,
    position: 'relative',
  },
  xLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 18,
    justifyContent: 'center',
    alignItems: 'center',
    rowGap: 8,
    columnGap: 16,
    paddingHorizontal: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendColor: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLine: {
    width: 12,
    height: 2,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
