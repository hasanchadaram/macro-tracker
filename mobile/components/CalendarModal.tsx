import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { getLocalDateString } from '@/lib/dateUtils';

interface CalendarModalProps {
  visible: boolean;
  selectedDate: string; // YYYY-MM-DD
  userId: string;
  onClose: () => void;
  onSelectDate: (date: string) => void;
}

export function CalendarModal({
  visible,
  selectedDate,
  userId,
  onClose,
  onSelectDate,
}: CalendarModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const accentColor = '#6366F1';

  // We maintain the currently viewed month/year in the calendar
  const [viewDate, setViewDate] = useState(new Date(selectedDate));
  const [loggedDates, setLoggedDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // When modal opens or selectedDate changes, reset view to selectedDate
  useEffect(() => {
    if (visible) {
      const [y, m, d] = selectedDate.split('-').map(Number);
      setViewDate(new Date(y, m - 1, d || 1));
    }
  }, [visible, selectedDate]);

  // Fetch logged days for the currently viewed month
  useEffect(() => {
    if (!visible || !userId) return;

    let isMounted = true;
    const fetchLoggedDays = async () => {
      setLoading(true);
      const year = viewDate.getFullYear();
      const month = viewDate.getMonth();
      const startOfMonth = new Date(year, month, 1);
      const endOfMonth = new Date(year, month + 1, 0);

      const startStr = getLocalDateString(startOfMonth);
      const endStr = getLocalDateString(endOfMonth);

      try {
        const [summariesRes, mealsRes] = await Promise.all([
          supabase
            .from('daily_summaries')
            .select('summary_date')
            .eq('user_id', userId)
            .gte('summary_date', startStr)
            .lte('summary_date', endStr)
            .gt('total_calories', 0),
          supabase
            .from('meal_entries')
            .select('summary_date')
            .eq('user_id', userId)
            .gte('summary_date', startStr)
            .lte('summary_date', endStr)
        ]);

        if (isMounted) {
          const dates = new Set<string>();
          summariesRes.data?.forEach(d => { if (d.summary_date) dates.add(d.summary_date); });
          mealsRes.data?.forEach(d => { if (d.summary_date) dates.add(d.summary_date); });
          setLoggedDates(dates);
        }
      } catch (error) {
        console.error('Error fetching calendar data', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchLoggedDays();
    return () => { isMounted = false; };
  }, [viewDate.getFullYear(), viewDate.getMonth(), visible, userId]);

  const changeMonth = (offset: number) => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    // Always anchor to day 1 when shifting months to prevent month skipping on 31-day months (e.g. Aug 31 -> Sep 31 -> Oct 1)
    const newDate = new Date(year, month + offset, 1);
    setViewDate(newDate);
  };

  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    
    // First day of month
    const firstDay = new Date(year, month, 1);
    const startingDayOfWeek = firstDay.getDay(); // 0 is Sunday
    
    // Days in month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    
    // Padding for previous month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Actual days
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      // Format as YYYY-MM-DD reliably
      const dateStr = [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0')
      ].join('-');
      days.push(dateStr);
    }
    
    return days;
  }, [viewDate]);

  const monthName = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.modalContent, { backgroundColor: cardBg }]}>
          
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => changeMonth(-1)} style={styles.navButton}>
              <Ionicons name="chevron-back" size={24} color={textPrimary} />
            </Pressable>
            <View style={styles.monthContainer}>
              <Text style={[styles.monthTitle, { color: textPrimary }]}>{monthName}</Text>
              {loading && <ActivityIndicator size="small" color={accentColor} style={{ marginLeft: 8 }} />}
            </View>
            <Pressable onPress={() => changeMonth(1)} style={styles.navButton}>
              <Ionicons name="chevron-forward" size={24} color={textPrimary} />
            </Pressable>
          </View>

          {/* Weekday labels */}
          <View style={styles.weekDaysRow}>
            {weekDays.map(day => (
              <Text key={day} style={[styles.weekDayText, { color: textSecondary }]}>{day}</Text>
            ))}
          </View>

          {/* Calendar Grid */}
          <View style={styles.daysGrid}>
            {calendarDays.map((dateStr, index) => {
              if (!dateStr) {
                return <View key={`pad-${index}`} style={styles.dayCell} />;
              }

              const isSelected = dateStr === selectedDate;
              const isToday = dateStr === getLocalDateString();
              const hasData = loggedDates.has(dateStr);
              const dayNum = parseInt(dateStr.split('-')[2], 10);

              return (
                <Pressable
                  key={dateStr}
                  style={[
                    styles.dayCell,
                    isSelected && { backgroundColor: accentColor, borderRadius: 20 }
                  ]}
                  onPress={() => onSelectDate(dateStr)}
                >
                  <Text style={[
                    styles.dayText,
                    { color: isSelected ? '#FFFFFF' : (isToday ? accentColor : textPrimary) },
                    isSelected && { fontWeight: '700' }
                  ]}>
                    {dayNum}
                  </Text>
                  
                  {/* Indicator Dot */}
                  <View style={[
                    styles.dot, 
                    hasData ? { backgroundColor: isSelected ? '#FFFFFF' : '#10B981' } : { backgroundColor: 'transparent' }
                  ]} />
                </Pressable>
              );
            })}
          </View>

          {/* Close Button */}
          <Pressable style={[styles.closeBtn, { borderColor: isDark ? '#334155' : '#E2E8F0' }]} onPress={onClose}>
            <Text style={[styles.closeBtnText, { color: textPrimary }]}>Close</Text>
          </Pressable>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    borderRadius: 24,
    padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      }
    })
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  navButton: {
    padding: 8,
  },
  monthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  weekDayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%', // 100% / 7
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  dayText: {
    fontSize: 15,
    fontWeight: '500',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
  closeBtn: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
