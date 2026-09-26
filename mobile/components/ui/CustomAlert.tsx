import React, { createContext, useContext, useState, useRef, ReactNode } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, Animated, ScrollView } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertOptions {
  title: string;
  message?: string;
  buttons?: AlertButton[];
}

interface AlertContextType {
  showAlert: (title: string, message?: string, buttons?: AlertButton[]) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export function useAlert() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [options, setOptions] = useState<AlertOptions | null>(null);
  const [fadeAnim] = useState(new Animated.Value(0));
  const alertIdRef = useRef(0);
  
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const showAlert = (title: string, message?: string, buttons?: AlertButton[]) => {
    alertIdRef.current++;
    setOptions({ title, message, buttons });
    setVisible(true);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const hideAlert = (callback?: () => void) => {
    const currentId = alertIdRef.current;
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      if (alertIdRef.current === currentId) {
        setVisible(false);
        setOptions(null);
      }
      if (callback) callback();
    });
  };

  const renderButtons = () => {
    if (!options?.buttons || options.buttons.length === 0) {
      return (
        <Pressable
          style={({ pressed }) => [
            styles.button,
            {
              borderTopColor: isDark ? '#334155' : '#E2E8F0',
              borderTopWidth: 1,
              backgroundColor: pressed
                ? isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)'
                : 'transparent',
            },
          ]}
          onPress={() => hideAlert()}
        >
          <Text style={[styles.buttonText, { color: '#3B82F6', fontWeight: '600' }]}>OK</Text>
        </Pressable>
      );
    }

    const buttons = options.buttons;
    // Auto-detect when buttons would be congested horizontally
    const shouldStackVertically =
      buttons.length > 2 ||
      buttons.some((b) => b.text.length > 12) ||
      buttons.reduce((sum, b) => sum + b.text.length, 0) > 20;

    if (shouldStackVertically) {
      // For vertical stack: place 'cancel' button at the bottom for standard mobile UX
      const sortedButtons = [...buttons].sort((a, b) => {
        if (a.style === 'cancel' && b.style !== 'cancel') return 1;
        if (a.style !== 'cancel' && b.style === 'cancel') return -1;
        return 0;
      });

      return (
        <View style={[styles.buttonContainerVertical, { borderTopColor: isDark ? '#334155' : '#E2E8F0' }]}>
          {sortedButtons.map((btn, index) => {
            const isDestructive = btn.style === 'destructive';
            const isCancel = btn.style === 'cancel';

            let btnColor = '#3B82F6';
            if (isDestructive) btnColor = '#EF4444';
            if (isCancel) btnColor = isDark ? '#94A3B8' : '#64748B';

            return (
              <Pressable
                key={index}
                style={({ pressed }) => [
                  styles.buttonVertical,
                  index > 0 && {
                    borderTopWidth: 1,
                    borderTopColor: isDark ? '#334155' : '#E2E8F0',
                  },
                  {
                    backgroundColor: pressed
                      ? isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)'
                      : 'transparent',
                  },
                ]}
                onPress={() => {
                  hideAlert(() => {
                    if (btn.onPress) btn.onPress();
                  });
                }}
              >
                <Text
                  style={[
                    styles.buttonText,
                    {
                      color: btnColor,
                      fontWeight: isCancel ? '500' : '600',
                      textAlign: 'center',
                    },
                  ]}
                  numberOfLines={2}
                >
                  {btn.text}
                </Text>
              </Pressable>
            );
          })}
        </View>
      );
    }

    return (
      <View style={[styles.buttonContainer, { borderTopColor: isDark ? '#334155' : '#E2E8F0' }]}>
        {buttons.map((btn, index) => {
          const isLast = index === buttons.length - 1;
          const isDestructive = btn.style === 'destructive';
          const isCancel = btn.style === 'cancel';

          let btnColor = '#3B82F6';
          if (isDestructive) btnColor = '#EF4444';
          if (isCancel) btnColor = isDark ? '#94A3B8' : '#64748B';

          return (
            <Pressable
              key={index}
              style={({ pressed }) => [
                styles.button,
                { flex: 1 },
                !isLast && {
                  borderRightWidth: 1,
                  borderRightColor: isDark ? '#334155' : '#E2E8F0',
                },
                {
                  backgroundColor: pressed
                    ? isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)'
                    : 'transparent',
                },
              ]}
              onPress={() => {
                hideAlert(() => {
                  if (btn.onPress) btn.onPress();
                });
              }}
            >
              <Text
                style={[
                  styles.buttonText,
                  { color: btnColor },
                  (btn.style === 'cancel' || buttons.length === 1) && { fontWeight: '600' },
                ]}
                numberOfLines={1}
              >
                {btn.text}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <Modal transparent visible={visible} animationType="none">
        <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
          <View
            style={[
              styles.alertBox,
              { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' },
            ]}
          >
            <ScrollView
              style={{ maxHeight: 420 }}
              contentContainerStyle={styles.contentContainer}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <Text style={[styles.title, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                {options?.title}
              </Text>
              {options?.message && (
                <Text
                  style={[
                    styles.message,
                    {
                      color: isDark ? '#94A3B8' : '#64748B',
                      textAlign: options.message.includes('\n') ? 'left' : 'center',
                    },
                  ]}
                >
                  {options.message}
                </Text>
              )}
            </ScrollView>
            {renderButtons()}
          </View>
        </Animated.View>
      </Modal>
    </AlertContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  alertBox: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  contentContainer: {
    padding: 22,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },
  buttonContainer: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  buttonContainerVertical: {
    flexDirection: 'column',
    borderTopWidth: 1,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonVertical: {
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
