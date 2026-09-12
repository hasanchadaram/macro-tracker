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
          style={[styles.button, { borderTopColor: isDark ? '#334155' : '#E2E8F0', borderTopWidth: 1 }]}
          onPress={() => hideAlert()}
        >
          <Text style={[styles.buttonText, { color: '#3B82F6', fontWeight: '600' }]}>OK</Text>
        </Pressable>
      );
    }

    return (
      <View style={[styles.buttonContainer, { borderTopColor: isDark ? '#334155' : '#E2E8F0' }]}>
        {options.buttons.map((btn, index) => {
          const isLast = index === options.buttons!.length - 1;
          const isDestructive = btn.style === 'destructive';
          const isCancel = btn.style === 'cancel';
          
          let btnColor = '#3B82F6';
          if (isDestructive) btnColor = '#EF4444';
          if (isCancel) btnColor = isDark ? '#94A3B8' : '#64748B';

          return (
            <Pressable
              key={index}
              style={[
                styles.button,
                options.buttons!.length > 1 && { flex: 1 },
                !isLast && options.buttons!.length > 1 && { 
                  borderRightWidth: 1, 
                  borderRightColor: isDark ? '#334155' : '#E2E8F0' 
                }
              ]}
              onPress={() => {
                hideAlert(() => {
                  if (btn.onPress) btn.onPress();
                });
              }}
            >
              <Text style={[
                styles.buttonText, 
                { color: btnColor },
                (btn.style === 'cancel' || options.buttons!.length === 1) && { fontWeight: '600' }
              ]}>
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
          <View style={[
            styles.alertBox, 
            { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }
          ]}>
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
                <Text style={[
                  styles.message, 
                  { 
                    color: isDark ? '#94A3B8' : '#64748B',
                    textAlign: options.message.includes('\n') ? 'left' : 'center',
                  }
                ]}>
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
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  alertBox: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  contentContainer: {
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  button: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 16,
  },
});
