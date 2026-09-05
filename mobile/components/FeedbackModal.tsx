import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAlert } from '@/components/ui/CustomAlert';
import { supabase } from '@/lib/supabase';

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
}

export function FeedbackModal({ visible, onClose }: FeedbackModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { showAlert } = useAlert();

  const [type, setType] = useState<'bug' | 'feedback'>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const inputBg = isDark ? '#0F172A' : '#F8FAFC';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const activeColor = type === 'bug' ? '#EF4444' : '#10B981';

  const titleLength = title.trim().length;
  const descLength = description.trim().length;
  const isTitleValid = titleLength >= 3 && titleLength <= 100;
  const isDescValid = descLength >= 10 && descLength <= 1000;
  const isValid = isTitleValid && isDescValid;

  const handleReset = () => {
    setTitle('');
    setDescription('');
    setType('bug');
    setIsSubmitting(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleTypeChange = (newType: 'bug' | 'feedback') => {
    if (type !== newType) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setType(newType);
    }
  };

  const handleSubmit = async () => {
    if (!isTitleValid) {
      showAlert('Invalid Title', 'Please enter a title between 3 and 100 characters.');
      return;
    }
    if (!isDescValid) {
      showAlert('Invalid Description', 'Please enter a description between 10 and 1,000 characters.');
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const appVersion = Constants.expoConfig?.version || '1.0.0';
      const osVersion = `${Platform.OS} ${Platform.Version}`;
      const deviceInfo = {
        platform: Platform.OS,
        osVersion: Platform.Version,
        isDevice: true,
      };

      const { data, error } = await supabase.functions.invoke('submit-feedback', {
        body: {
          type,
          title: title.trim(),
          description: description.trim(),
          app_version: appVersion,
          os_version: osVersion,
          device_info: deviceInfo,
        },
      });

      if (error) {
        // If error response from edge function
        let errorMsg = error.message;
        if (error.context && typeof error.context.json === 'function') {
          try {
            const json = await error.context.json();
            if (json.error) errorMsg = json.error;
          } catch (e) {}
        }
        throw new Error(errorMsg);
      }

      if (data && data.error) {
        throw new Error(data.error);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      handleClose();
      showAlert(
        type === 'bug' ? '🐛 Bug / Complaint Submitted' : '💡 Feedback Received',
        type === 'bug'
          ? 'Thank you for reaching out! Our team has received your submission and will review it promptly.'
          : 'Thank you for your feedback! Your ideas help make the app better for everyone.'
      );
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showAlert(
        'Submission Failed',
        err.message || 'Could not submit feedback. Please try again later.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={[styles.modalContent, { backgroundColor: cardBg }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              <View style={[styles.typeIconBadge, { backgroundColor: type === 'bug' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)' }]}>
                <Ionicons
                  name={type === 'bug' ? 'bug-outline' : 'bulb-outline'}
                  size={20}
                  color={activeColor}
                />
              </View>
              <Text style={[styles.title, { color: textPrimary }]}>
                {type === 'bug' ? 'Bug / Complaint' : 'Share Feedback'}
              </Text>
            </View>
            <Pressable onPress={handleClose} style={styles.closeBtn} hitSlop={10}>
              <Ionicons name="close" size={24} color={textPrimary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Segmented Type Toggle */}
            <View style={[styles.segmentContainer, { backgroundColor: inputBg, borderColor }]}>
              <Pressable
                style={[
                  styles.segmentButton,
                  type === 'bug' && [styles.segmentButtonActive, { backgroundColor: '#EF4444' }],
                ]}
                onPress={() => handleTypeChange('bug')}
              >
                <Ionicons
                  name="bug"
                  size={16}
                  color={type === 'bug' ? '#FFFFFF' : textSecondary}
                />
                <Text
                  style={[
                    styles.segmentText,
                    { color: type === 'bug' ? '#FFFFFF' : textSecondary },
                  ]}
                >
                  Bug / Complaint
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.segmentButton,
                  type === 'feedback' && [styles.segmentButtonActive, { backgroundColor: '#10B981' }],
                ]}
                onPress={() => handleTypeChange('feedback')}
              >
                <Ionicons
                  name="bulb"
                  size={16}
                  color={type === 'feedback' ? '#FFFFFF' : textSecondary}
                />
                <Text
                  style={[
                    styles.segmentText,
                    { color: type === 'feedback' ? '#FFFFFF' : textSecondary },
                  ]}
                >
                  Feedback / Idea
                </Text>
              </Pressable>
            </View>

            {/* Title Input */}
            <View style={styles.fieldContainer}>
              <View style={styles.labelRow}>
                <Text style={[styles.label, { color: textSecondary }]}>Title</Text>
                <Text
                  style={[
                    styles.charCounter,
                    { color: titleLength > 100 ? '#EF4444' : textSecondary },
                  ]}
                >
                  {titleLength} / 100
                </Text>
              </View>
              <TextInput
                style={[
                  styles.textInput,
                  { backgroundColor: inputBg, color: textPrimary, borderColor },
                ]}
                placeholder={
                  type === 'bug'
                    ? 'e.g. Issue logging lunch, or complaint about food scanner'
                    : 'e.g. Add dark mode widget to home screen'
                }
                placeholderTextColor={textSecondary}
                maxLength={100}
                value={title}
                onChangeText={setTitle}
                returnKeyType="next"
              />
            </View>

            {/* Description Input */}
            <View style={styles.fieldContainer}>
              <View style={styles.labelRow}>
                <Text style={[styles.label, { color: textSecondary }]}>Description</Text>
                <Text
                  style={[
                    styles.charCounter,
                    { color: descLength > 1000 ? '#EF4444' : textSecondary },
                  ]}
                >
                  {descLength} / 1,000
                </Text>
              </View>
              <TextInput
                style={[
                  styles.textArea,
                  { backgroundColor: inputBg, color: textPrimary, borderColor },
                ]}
                placeholder={
                  type === 'bug'
                    ? 'Please describe the bug, issue, or complaint in detail...'
                    : 'Describe your idea or suggestion and how it would improve your experience...'
                }
                placeholderTextColor={textSecondary}
                multiline
                numberOfLines={6}
                maxLength={1000}
                textAlignVertical="top"
                value={description}
                onChangeText={setDescription}
              />
            </View>

            {/* Info Hint */}
            <View style={[styles.infoBox, { backgroundColor: isDark ? '#0F172A' : '#F1F5F9' }]}>
              <Ionicons name="shield-checkmark-outline" size={16} color="#6366F1" />
              <Text style={[styles.infoText, { color: textSecondary }]}>
                Device details ({Platform.OS} {Platform.Version}) and app version will be included automatically to help debug.
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.buttonContainer}>
              <Pressable
                style={[styles.cancelButton, { borderColor }]}
                onPress={handleClose}
                disabled={isSubmitting}
              >
                <Text style={[styles.cancelButtonText, { color: textSecondary }]}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.submitButton,
                  { backgroundColor: activeColor },
                  (!isValid || isSubmitting) && styles.submitButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={!isValid || isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="paper-plane" size={16} color="#FFFFFF" />
                    <Text style={styles.submitButtonText}>Submit</Text>
                  </>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  typeIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  segmentContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    marginBottom: 20,
    gap: 6,
  },
  segmentButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  segmentButtonActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
  },
  fieldContainer: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  charCounter: {
    fontSize: 12,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 120,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 8,
    marginBottom: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
    marginBottom: 10,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  submitButton: {
    flex: 2,
    flexDirection: 'row',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.45,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
