import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
  ScrollView,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { useAlert } from '@/components/ui/CustomAlert';

interface BYOKModalProps {
  visible: boolean;
  onClose: () => void;
  hasCustomKey: boolean;
  onSaveSuccess: () => void;
}

export function BYOKModal({ visible, onClose, hasCustomKey, onSaveSuccess }: BYOKModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { showAlert } = useAlert();

  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const inputBg = isDark ? '#0F172A' : '#F1F5F9';
  const accentColor = '#6366F1';

  // Clear input when modal opens
  useEffect(() => {
    if (visible) {
      setApiKey('');
    }
  }, [visible]);

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      showAlert('Error', 'Please enter a valid API key.');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.rpc('update_custom_api_key', {
        new_key: apiKey.trim(),
      });

      if (error) throw error;
      
      showAlert('Success', 'Your API key has been securely saved.');
      onSaveSuccess();
      handleClose();
    } catch (e: any) {
      showAlert('Save Failed', e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveKeyPrompt = () => {
    showAlert(
      'Remove Custom API Key?',
      'Your custom Gemini key will be deleted. Your upcoming meal scans will safely switch back to the Free Tier (with daily scan limits and default AI model).\n\nYou can add a key again anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove Key',
          style: 'destructive',
          onPress: executeRemoveKey,
        },
      ]
    );
  };

  const executeRemoveKey = async () => {
    setIsRemoving(true);
    try {
      const { error } = await supabase.rpc('remove_custom_api_key');
      if (error) throw error;

      showAlert('Key Removed', 'Your custom API key has been removed. You are now using the Free Tier.');
      onSaveSuccess();
      handleClose();
    } catch (e: any) {
      showAlert('Removal Failed', e.message || 'Could not remove key.');
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        style={styles.overlay}
      >
        <Pressable style={styles.topSpacer} onPress={handleClose} />
        <View style={[styles.modalContainer, { backgroundColor: cardBg }]}>
          <ScrollView 
            showsVerticalScrollIndicator={false} 
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.header}>
              <Text style={[styles.title, { color: textPrimary }]}>Bring Your Own Key</Text>
              <Pressable onPress={handleClose} style={styles.closeBtn} disabled={isSaving || isRemoving} hitSlop={8}>
                <Ionicons name="close" size={24} color={textSecondary} />
              </Pressable>
            </View>

            {hasCustomKey && (
              <View style={[
                styles.activeKeyBox, 
                { 
                  backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.08)',
                  borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.2)'
                }
              ]}>
                <Ionicons name="checkmark-circle" size={22} color="#10B981" style={{ marginTop: 1 }} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.activeKeyTitle, { color: textPrimary }]}>Custom API Key Active</Text>
                  <Text style={[styles.activeKeyText, { color: textSecondary }]}>
                    Personal free tier quota and custom AI model selection are active.
                  </Text>
                </View>
              </View>
            )}

            <View style={[styles.infoBox, { backgroundColor: 'rgba(99, 102, 241, 0.1)' }]}>
              <Ionicons name="information-circle" size={24} color={accentColor} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.infoTitle, { color: textPrimary }]}>Free AI Features</Text>
                <Text style={[styles.infoText, { color: textSecondary }]}>
                  By providing your own Gemini API key, you can unlock free AI features. 
                  Your key is encrypted and stored safely on our secure servers, and it is entirely inaccessible to other users or apps.
                </Text>
              </View>
            </View>

            <Text style={[styles.label, { color: textPrimary }]}>
              {hasCustomKey ? 'Replace Gemini API Key' : 'Your Gemini API Key'}
            </Text>
            
            {hasCustomKey && !apiKey && (
              <Text style={{ color: textSecondary, fontSize: 13, marginBottom: 8 }}>
                Enter a new key below if you wish to replace your current key.
              </Text>
            )}

            <TextInput
              style={[
                styles.input,
                { color: textPrimary, backgroundColor: inputBg, borderColor }
              ]}
              placeholder="AIzaSy..."
              placeholderTextColor={textSecondary}
              value={apiKey}
              onChangeText={setApiKey}
              autoCapitalize="none"
              secureTextEntry
              autoCorrect={false}
              editable={!isSaving && !isRemoving}
            />

            <Pressable 
              style={styles.linkButton} 
              onPress={() => Linking.openURL('https://aistudio.google.com/app/apikey')}
            >
              <Ionicons name="open-outline" size={16} color={accentColor} style={{ marginRight: 6 }} />
              <Text style={[styles.linkText, { color: accentColor }]}>Get a key from Google AI Studio</Text>
            </Pressable>

            <View style={styles.actionButtonsContainer}>
              <Pressable 
                style={[styles.saveButton, isSaving && { opacity: 0.7 }]} 
                onPress={handleSave}
                disabled={isSaving || isRemoving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {hasCustomKey ? 'Update Key' : 'Save Key'}
                  </Text>
                )}
              </Pressable>

              {hasCustomKey && (
                <Pressable 
                  style={[
                    styles.removeButton, 
                    {
                      borderColor: isDark ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.25)',
                      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
                    },
                    isRemoving && { opacity: 0.7 }
                  ]} 
                  onPress={handleRemoveKeyPrompt}
                  disabled={isSaving || isRemoving}
                >
                  {isRemoving ? (
                    <ActivityIndicator color="#EF4444" />
                  ) : (
                    <View style={styles.removeBtnContent}>
                      <Ionicons name="trash-outline" size={18} color="#EF4444" style={{ marginRight: 8 }} />
                      <Text style={styles.removeButtonText}>Remove API Key</Text>
                    </View>
                  )}
                </Pressable>
              )}
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  topSpacer: {
    flex: 1,
  },
  modalContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '94%',
    width: '100%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      }
    })
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  infoBox: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  activeKeyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 18,
  },
  activeKeyTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  activeKeyText: {
    fontSize: 13,
    lineHeight: 18,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonsContainer: {
    gap: 12,
  },
  saveButton: {
    backgroundColor: '#6366F1',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  removeButton: {
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  removeBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '600',
  },
});

