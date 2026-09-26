import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { CheckUpdateResult } from '@/lib/versionUtils';

interface AppUpdateModalProps {
  visible: boolean;
  updateResult: CheckUpdateResult | null;
  onDismiss: () => void;
  onUpdate: () => void;
}

export function AppUpdateModal({
  visible,
  updateResult,
  onDismiss,
  onUpdate,
}: AppUpdateModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  if (!visible || !updateResult || updateResult.updateLevel === 'none' || updateResult.updateLevel === 'simple') {
    return null;
  }

  const isMandatory = updateResult.updateLevel === 'mandatory';

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const notesBg = isDark ? '#0F172A' : '#F8FAFC';

  const handleUpdatePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onUpdate();
  };

  const handleLaterPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={isMandatory ? () => {} : onDismiss}
    >
      <View style={styles.backdrop}>
        {/* If non-mandatory, tapping the top area dismisses */}
        {!isMandatory && (
          <Pressable style={styles.topBackdropPressable} onPress={onDismiss} />
        )}

        <View
          style={[
            styles.cardContainer,
            { backgroundColor: cardBg, borderColor },
            isMandatory && styles.mandatoryCard,
          ]}
        >
          {/* Badge Icon */}
          <View
            style={[
              styles.iconBadge,
              {
                backgroundColor: isMandatory
                  ? 'rgba(239, 68, 68, 0.12)'
                  : 'rgba(16, 185, 129, 0.12)',
              },
            ]}
          >
            <Ionicons
              name={isMandatory ? 'alert-circle' : 'rocket-outline'}
              size={32}
              color={isMandatory ? '#EF4444' : '#10B981'}
            />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: textPrimary }]}>
            {isMandatory
              ? 'Update Required ⚠️'
              : updateResult.title || 'Update Available 🚀'}
          </Text>

          {/* Version subtitle */}
          <Text style={[styles.versionSubtitle, { color: textSecondary }]}>
            {isMandatory
              ? 'This version is no longer supported'
              : `Version ${updateResult.latestVersion || ''} is now available`}
          </Text>

          {/* Message Description */}
          <Text style={[styles.description, { color: textSecondary }]}>
            {isMandatory
              ? 'To keep tracking your nutrition and using all features safely, please update Day Fuel to the latest version on Google Play.'
              : 'A new version of Day Fuel is available with new features and performance enhancements.'}
          </Text>

          {/* Release Notes (if present) */}
          {updateResult.releaseNotes && (
            <View style={[styles.notesCard, { backgroundColor: notesBg, borderColor }]}>
              <View style={styles.notesHeader}>
                <Ionicons name="sparkles" size={14} color="#10B981" />
                <Text style={[styles.notesTitle, { color: textPrimary }]}>
                  What's New
                </Text>
              </View>
              <ScrollView
                style={styles.notesScroll}
                showsVerticalScrollIndicator={false}
              >
                <Text style={[styles.notesText, { color: textSecondary }]}>
                  {updateResult.releaseNotes}
                </Text>
              </ScrollView>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            {!isMandatory && (
              <Pressable
                style={[styles.laterButton, { borderColor }]}
                onPress={handleLaterPress}
              >
                <Text style={[styles.laterButtonText, { color: textSecondary }]}>
                  Later
                </Text>
              </Pressable>
            )}

            <Pressable
              style={[
                styles.updateButton,
                isMandatory && styles.mandatoryUpdateButton,
              ]}
              onPress={handleUpdatePress}
            >
              <Ionicons
                name="logo-google-playstore"
                size={18}
                color="#FFFFFF"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.updateButtonText}>
                {isMandatory ? 'Update Day Fuel' : 'Update Now'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  topBackdropPressable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  mandatoryCard: {
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  versionSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
  },
  notesCard: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 20,
    maxHeight: 120,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  notesTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  notesScroll: {
    maxHeight: 80,
  },
  notesText: {
    fontSize: 13,
    lineHeight: 18,
  },
  actionsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  laterButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  updateButton: {
    flex: 2,
    backgroundColor: '#10B981',
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mandatoryUpdateButton: {
    flex: 1,
    backgroundColor: '#10B981',
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
