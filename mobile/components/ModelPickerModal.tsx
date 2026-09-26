import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { useAlert } from '@/components/ui/CustomAlert';
import {
  GeminiModelOption,
  getAvailableByokModels,
  DEFAULT_BYOK_MODEL_ID,
} from '@/constants/aiModels';

interface ModelPickerModalProps {
  visible: boolean;
  onClose: () => void;
  selectedModelId?: string | null;
  onModelSelected: (modelId: string) => void;
}

export function ModelPickerModal({
  visible,
  onClose,
  selectedModelId,
  onModelSelected,
}: ModelPickerModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { showAlert } = useAlert();

  const [isUpdating, setIsUpdating] = useState(false);
  const [updatingModelId, setUpdatingModelId] = useState<string | null>(null);

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const accentColor = '#6366F1';

  const models = getAvailableByokModels();
  const activeModelId = selectedModelId || DEFAULT_BYOK_MODEL_ID;

  const handleSelectModel = async (model: GeminiModelOption) => {
    if (model.id === activeModelId) {
      onClose();
      return;
    }

    try {
      setIsUpdating(true);
      setUpdatingModelId(model.id);
      await Haptics.selectionAsync();

      const { error } = await supabase.rpc('update_byok_model', {
        new_model: model.id,
      });

      if (error) throw error;

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onModelSelected(model.id);
      onClose();
    } catch (e: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showAlert('Update Failed', e.message || 'Could not update AI model.');
    } finally {
      setIsUpdating(false);
      setUpdatingModelId(null);
    }
  };

  const getBadgeColors = (badge?: string) => {
    if (badge === 'Recommended') {
      return {
        bg: isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.12)',
        text: '#818CF8',
      };
    }
    if (badge === 'Default') {
      return {
        bg: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.12)',
        text: '#10B981',
      };
    }
    if (badge === 'Ultra Fast' || badge === 'Fast') {
      return {
        bg: isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.12)',
        text: '#F59E0B',
      };
    }
    return {
      bg: isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(100, 116, 139, 0.12)',
      text: textSecondary,
    };
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, { backgroundColor: cardBg }]}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.headerIconContainer, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                <Ionicons name="hardware-chip-outline" size={20} color={accentColor} />
              </View>
              <Text style={[styles.title, { color: textPrimary }]}>Select AI Model</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={24} color={textSecondary} />
            </Pressable>
          </View>

          <Text style={[styles.subheading, { color: textSecondary }]}>
            Choose which AI model processes your meal scans. Your custom API key will be used directly.
          </Text>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {models.map((model) => {
              const isSelected = model.id === activeModelId;
              const isThisUpdating = isUpdating && updatingModelId === model.id;
              const badgeColors = getBadgeColors(model.badge);

              return (
                <Pressable
                  key={model.id}
                  style={({ pressed }) => [
                    styles.modelCard,
                    {
                      backgroundColor: isSelected
                        ? (isDark ? 'rgba(99, 102, 241, 0.12)' : 'rgba(99, 102, 241, 0.06)')
                        : (isDark ? '#0F172A' : '#F8FAFC'),
                      borderColor: isSelected ? accentColor : borderColor,
                      opacity: isUpdating && !isThisUpdating ? 0.6 : (pressed ? 0.85 : 1),
                    },
                  ]}
                  onPress={() => handleSelectModel(model)}
                  disabled={isUpdating}
                >
                  <View style={styles.modelContent}>
                    <View style={styles.modelTopRow}>
                      <Text style={[styles.modelName, { color: textPrimary }]}>
                        {model.name}
                      </Text>
                      {model.badge ? (
                        <View style={[styles.badge, { backgroundColor: badgeColors.bg }]}>
                          <Text style={[styles.badgeText, { color: badgeColors.text }]}>
                            {model.badge}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <Text style={[styles.modelDescription, { color: textSecondary }]}>
                      {model.description}
                    </Text>
                  </View>

                  <View style={styles.radioContainer}>
                    {isThisUpdating ? (
                      <ActivityIndicator size="small" color={accentColor} />
                    ) : isSelected ? (
                      <Ionicons name="checkmark-circle" size={24} color={accentColor} />
                    ) : (
                      <View
                        style={[
                          styles.radioCircle,
                          { borderColor: isDark ? '#475569' : '#CBD5E1' },
                        ]}
                      />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingTop: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  subheading: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 12,
  },
  modelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  modelContent: {
    flex: 1,
    marginRight: 12,
  },
  modelTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  modelName: {
    fontSize: 16,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modelDescription: {
    fontSize: 13,
    lineHeight: 17,
  },
  radioContainer: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
});
