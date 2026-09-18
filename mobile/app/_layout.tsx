import { Ionicons } from "@expo/vector-icons";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Session } from "@supabase/supabase-js";
import { makeRedirectUri } from "expo-auth-session";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { supabase } from "@/lib/supabase";
import { AlertProvider, useAlert } from "@/components/ui/CustomAlert";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  return (
    <AlertProvider>
      <RootContent />
    </AlertProvider>
  );
}

function RootContent() {
  const colorScheme = useColorScheme();
  const { showAlert } = useAlert();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [signingInEmail, setSigningInEmail] = useState<boolean>(false);
  const [signingInGoogle, setSigningInGoogle] = useState<boolean>(false);
  const isSigningIn = signingInEmail || signingInGoogle;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // 2. Listen to Supabase authentication updates
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Handle the deep link callback from OAuth
  const extractSessionFromUrl = async (url: string) => {
    // Supabase appends tokens as a URL fragment: #access_token=...&refresh_token=...
    const params = new URLSearchParams(url.split("#")[1] || "");
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        showAlert("Session Error", error.message);
      }
    }
  };

  // Sign in with Google via Supabase OAuth (opens browser)
  const signInWithGoogle = async () => {
    try {
      setSigningInGoogle(true);

      const redirectTo = makeRedirectUri({
        scheme: "dayfuel",
        path: "login-callback",
      });
      console.log("--- SUPABASE REDIRECT URL ---");
      console.log(redirectTo);
      console.log("-----------------------------");

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
        },
      });

      if (error) throw error;
      if (!data.url) throw new Error("No OAuth URL returned.");

      // Open the browser for the user to authenticate
      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectTo,
      );

      if (result.type === "success" && result.url) {
        await extractSessionFromUrl(result.url);
      }
    } catch (error: any) {
      showAlert(
        "Authentication Error",
        error.message || "An error occurred during Google Sign-In.",
      );
    } finally {
      setSigningInGoogle(false);
    }
  };

  // Sign in with Email and Password
  const signInWithEmail = async () => {
    if (!email || !password) {
      showAlert("Error", "Please enter both email and password.");
      return;
    }
    try {
      setSigningInEmail(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
    } catch (error: any) {
      showAlert("Authentication Error", error.message);
    } finally {
      setSigningInEmail(false);
    }
  };


  const useLocalSupabase = process.env.EXPO_PUBLIC_USE_LOCAL_SUPABASE === 'true';
  // console.log("useLocalSupabase:", useLocalSupabase);
  // console.log("session:", session);

  // Loading state while verifying auth session
  if (loading) {
    const isDark = colorScheme === "dark";
    return (
      <GestureHandlerRootView style={styles.root}>
        <View
          style={[
            styles.loadingContainer,
            { backgroundColor: isDark ? "#0F172A" : "#F8FAFC" },
          ]}
        >
          <ActivityIndicator size="large" color="#6366F1" />
        </View>
      </GestureHandlerRootView>
    );
  }

  // 3. If NO active session, render Login Screen
  if (!session && !useLocalSupabase) {
    const isDark = colorScheme === "dark";
    return (
      <GestureHandlerRootView style={styles.root}>
      <View
        style={[
          styles.loginContainer,
          { backgroundColor: isDark ? "#0F172A" : "#F8FAFC" },
        ]}
      >
        <StatusBar style={isDark ? "light" : "dark"} />

        <View style={styles.headerBadge}>
          <Ionicons name="flame-sharp" size={44} color="#6366F1" />
        </View>

        <Text style={[styles.title, { color: isDark ? "#F8FAFC" : "#0F172A" }]}>
          Day Fuel
        </Text>
        <Text
          style={[styles.subtitle, { color: isDark ? "#94A3B8" : "#64748B" }]}
        >
          Fuel your body with precision tracking. Sign in to start your fitness
          journey.
        </Text>

        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? "#1E293B" : "#FFFFFF",
              borderColor: isDark ? "#334155" : "#E2E8F0",
            },
          ]}
        >
          <TextInput
            style={[
              styles.input,
              {
                color: isDark ? "#F8FAFC" : "#0F172A",
                backgroundColor: isDark ? "#0F172A" : "#F8FAFC",
                borderColor: isDark ? "#334155" : "#E2E8F0",
              },
            ]}
            placeholder="Email"
            placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={[
              styles.input,
              {
                color: isDark ? "#F8FAFC" : "#0F172A",
                backgroundColor: isDark ? "#0F172A" : "#F8FAFC",
                borderColor: isDark ? "#334155" : "#E2E8F0",
                marginBottom: 20,
              },
            ]}
            placeholder="Password"
            placeholderTextColor={isDark ? "#64748B" : "#94A3B8"}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Pressable
            style={({ pressed }) => [
              styles.emailButton,
              pressed && styles.buttonPressed,
              isSigningIn && styles.buttonDisabled,
            ]}
            onPress={signInWithEmail}
            disabled={isSigningIn}
          >
            {signingInEmail ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.emailButtonText}>Sign in</Text>
            )}
          </Pressable>

          <View style={styles.dividerContainer}>
            <View style={[styles.divider, { backgroundColor: isDark ? "#334155" : "#E2E8F0" }]} />
            <Text style={[styles.dividerText, { color: isDark ? "#64748B" : "#94A3B8" }]}>or</Text>
            <View style={[styles.divider, { backgroundColor: isDark ? "#334155" : "#E2E8F0" }]} />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.googleButton,
              pressed && styles.buttonPressed,
              isSigningIn && styles.buttonDisabled,
            ]}
            onPress={signInWithGoogle}
            disabled={isSigningIn}
          >
            {signingInGoogle ? (
              <ActivityIndicator color="#0F172A" />
            ) : (
              <>
                <Ionicons
                  name="logo-google"
                  size={20}
                  color="#4285F4"
                  style={styles.googleIcon}
                />
                <Text style={styles.googleButtonText}>Sign in with Google</Text>
              </>
            )}
          </Pressable>
        </View>

        <Text
          style={[styles.footerText, { color: isDark ? "#64748B" : "#94A3B8" }]}
        >
          Secure authentication powered by Supabase & Google
        </Text>
      </View>
      </GestureHandlerRootView>
    );
  }

  // 4. If IS active session, render main authenticated application interface
  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="my-foods" options={{ headerShown: false }} />
          <Stack.Screen
            name="modal"
            options={{ presentation: "modal", title: "Modal" }}
          />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loginContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  headerBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(99, 102, 241, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 36,
    paddingHorizontal: 12,
  },
  card: {
    width: "100%",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
    marginBottom: 24,
  },
  input: {
    width: "100%",
    height: 50,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 12,
  },
  emailButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6366F1",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    width: "100%",
    marginBottom: 16,
  },
  emailButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginBottom: 16,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    paddingHorizontal: 12,
    fontSize: 14,
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    width: "100%",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  googleIcon: {
    marginRight: 12,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
  },
  footerText: {
    fontSize: 12,
    textAlign: "center",
  },
});
