import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AVATAR_OPTIONS, AvatarOption, AvatarSeries } from '../constants/avatars';
import UserAvatar from './UserAvatar';

interface AvatarPickerModalProps {
  visible: boolean;
  selectedAvatarId?: string | null;
  googleAvatarUrl?: string | null;
  fallbackInitial?: string;
  onSelectAvatar: (avatarId: string) => Promise<void> | void;
  onClose: () => void;
  isSaving?: boolean;
}

const SERIES_TABS: { key: AvatarSeries; label: string; icon?: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'All', label: 'All' },
  { key: 'KonoSuba', label: 'KonoSuba' },
  { key: 'Black Clover', label: 'Black Clover' },
];

export default function AvatarPickerModal({
  visible,
  selectedAvatarId = 'default',
  googleAvatarUrl,
  fallbackInitial = 'U',
  onSelectAvatar,
  onClose,
  isSaving = false,
}: AvatarPickerModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [activeTab, setActiveTab] = useState<AvatarSeries>('All');
  const currentSelectedId = selectedAvatarId || 'default';

  const bgModal = isDark ? '#1E293B' : '#FFFFFF';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const itemBorder = isDark ? '#334155' : '#E2E8F0';
  const tabBg = isDark ? '#0F172A' : '#F1F5F9';

  // Filter options based on active tab
  const filteredOptions = AVATAR_OPTIONS.filter((option) => {
    if (activeTab === 'All') return true;
    return option.series === activeTab;
  });

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={[styles.modalContainer, { backgroundColor: bgModal }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTextContainer}>
              <Text style={[styles.title, { color: textPrimary }]}>Choose Avatar</Text>
              <Text style={[styles.subtitle, { color: textSecondary }]}>
                Pick your favorite character or keep your default avatar
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                { backgroundColor: isDark ? '#334155' : '#F1F5F9', opacity: pressed ? 0.7 : 1 },
              ]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close avatar picker"
            >
              <Ionicons name="close" size={20} color={textPrimary} />
            </Pressable>
          </View>

          {/* Series Tabs Filter */}
          <View style={[styles.tabBar, { backgroundColor: tabBg }]}>
            {SERIES_TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={[
                    styles.tabButton,
                    isActive && {
                      backgroundColor: isDark ? '#334155' : '#FFFFFF',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.1,
                      shadowRadius: 3,
                      elevation: 2,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tabButtonText,
                      {
                        color: isActive ? (isDark ? '#F8FAFC' : '#0F172A') : textSecondary,
                        fontWeight: isActive ? '700' : '500',
                      },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Avatar Options List */}
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {filteredOptions.map((option: AvatarOption) => {
              const isSelected = currentSelectedId.toLowerCase() === option.id.toLowerCase();
              const accentColor = option.themeColor || '#6366F1';

              return (
                <Pressable
                  key={option.id}
                  disabled={isSaving}
                  onPress={() => onSelectAvatar(option.id)}
                  style={({ pressed }) => [
                    styles.avatarCard,
                    {
                      backgroundColor: isSelected
                        ? isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.08)'
                        : isDark ? '#0F172A' : '#F8FAFC',
                      borderColor: isSelected ? accentColor : itemBorder,
                      borderWidth: isSelected ? 2 : 1,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <UserAvatar
                    avatarId={option.id}
                    googleAvatarUrl={googleAvatarUrl}
                    fallbackInitial={fallbackInitial}
                    size={52}
                    borderWidth={isSelected ? 2 : 0}
                    borderColor={isSelected ? accentColor : undefined}
                  />

                  <View style={styles.infoContainer}>
                    <View style={styles.nameRow}>
                      <Text style={[styles.optionName, { color: textPrimary }]} numberOfLines={1}>
                        {option.character}
                      </Text>
                      {option.series ? (
                        <View
                          style={[
                            styles.seriesTag,
                            {
                              backgroundColor:
                                option.id === 'default'
                                  ? isDark ? '#334155' : '#E2E8F0'
                                  : `${accentColor}20`,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.seriesTagText,
                              {
                                color: option.id === 'default' ? textSecondary : accentColor,
                              },
                            ]}
                          >
                            {option.series}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.optionDesc, { color: textSecondary }]} numberOfLines={1}>
                      {option.description}
                    </Text>
                  </View>

                  <View style={styles.actionContainer}>
                    {isSelected ? (
                      <View style={[styles.selectedCircle, { backgroundColor: accentColor }]}>
                        <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.unselectedCircle,
                          { borderColor: isDark ? '#475569' : '#CBD5E1' },
                        ]}
                      />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Footer */}
          {isSaving && (
            <View style={styles.savingRow}>
              <ActivityIndicator size="small" color="#6366F1" />
              <Text style={[styles.savingText, { color: textSecondary }]}>Updating avatar...</Text>
            </View>
          )}

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.doneButton,
              { opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTextContainer: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 3,
    lineHeight: 18,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonText: {
    fontSize: 13,
  },
  list: {
    maxHeight: 380,
  },
  listContent: {
    paddingVertical: 4,
    gap: 10,
  },
  avatarCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 16,
    gap: 12,
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionName: {
    fontSize: 15,
    fontWeight: '700',
  },
  seriesTag: {
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  seriesTagText: {
    fontSize: 10,
    fontWeight: '600',
  },
  optionDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  actionContainer: {
    paddingLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unselectedCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  savingText: {
    fontSize: 13,
    fontWeight: '500',
  },
  doneButton: {
    marginTop: 14,
    backgroundColor: '#6366F1',
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
