import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface LogWeightModalProps {
  visible: boolean;
  initialWeight?: number | null;
  isEditing?: boolean;
  onClose: () => void;
  onLogWeight: (weight: number) => Promise<void>;
}

export function LogWeightModal({
  visible,
  initialWeight,
  isEditing,
  onClose,
  onLogWeight,
}: LogWeightModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [weightText, setWeightText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const isUpdating = isEditing || (initialWeight !== null && initialWeight !== undefined);

  useEffect(() => {
    if (visible) {
      setWeightText(initialWeight ? initialWeight.toString() : '');
    }
  }, [visible, initialWeight]);

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const inputBg = isDark ? '#0F172A' : '#F8FAFC';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const activeColor = '#8B5CF6'; // Purple for weight

  const handleReset = () => {
    setWeightText('');
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleSubmit = async () => {
    const weightNum = parseFloat(weightText);
    if (isNaN(weightNum) || weightNum <= 0) {
      return;
    }

    setIsProcessing(true);
    try {
      await onLogWeight(weightNum);
      handleClose();
    } catch (error) {
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={[styles.modalContent, { backgroundColor: cardBg }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: textPrimary }]}>
              {isUpdating ? "Update Today's Weight" : "Log Today's Weight"}
            </Text>
            <Pressable onPress={handleClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={textPrimary} />
            </Pressable>
          </View>

          <View style={styles.inputContainer}>
            <Text style={[styles.label, { color: textSecondary }]}>Weight (kg)</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: inputBg, color: textPrimary, borderColor }]}
              placeholder="e.g. 70.5"
              placeholderTextColor={textSecondary}
              keyboardType="decimal-pad"
              value={weightText}
              onChangeText={setWeightText}
              autoFocus
            />
            <View style={styles.tipContainer}>
              <Ionicons name="information-circle-outline" size={16} color={textSecondary} />
              <Text style={[styles.tipText, { color: textSecondary }]}>
                {isUpdating
                  ? "Entering a new value will update today's log and recalculate your progress."
                  : "Tip: Track early morning before drinking water for best accuracy."}
              </Text>
            </View>
          </View>

          <Pressable
            style={[
              styles.submitBtn,
              { backgroundColor: activeColor },
              (isProcessing || !weightText.trim() || isNaN(parseFloat(weightText))) && { opacity: 0.7 }
            ]}
            onPress={handleSubmit}
            disabled={isProcessing || !weightText.trim() || isNaN(parseFloat(weightText))}
          >
            {isProcessing ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitBtnText}>
                {isUpdating ? "Update Weight" : "Log Weight"}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    fontWeight: '600',
  },
  tipContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 4,
    gap: 6,
  },
  tipText: {
    fontSize: 12,
    fontStyle: 'italic',
    flex: 1,
  },
  submitBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
