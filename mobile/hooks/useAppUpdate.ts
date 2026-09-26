import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkForAppUpdate, openPlayStore, type CheckUpdateResult } from '@/lib/versionUtils';

const DISMISSED_UPDATE_KEY = 'last_dismissed_recommended_update';
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between background-to-foreground checks
const RECOMMEND_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours between recommended update prompts

export function useAppUpdate() {
  const [updateResult, setUpdateResult] = useState<CheckUpdateResult | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);

  const lastCheckTimeRef = useRef<number>(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const evaluateAndShow = useCallback(async (result: CheckUpdateResult) => {
    setUpdateResult(result);

    if (!result.hasUpdate || result.updateLevel === 'none') {
      setShowModal(false);
      return;
    }

    // 1. Mandatory Update: Always show blocking modal, cannot be dismissed
    if (result.updateLevel === 'mandatory') {
      setShowModal(true);
      return;
    }

    // 2. Simple Update: Quiet, never show intrusive modal
    if (result.updateLevel === 'simple') {
      setShowModal(false);
      return;
    }

    // 3. Recommended Update: Check if user dismissed recently (24h cooldown per version)
    if (result.updateLevel === 'recommended') {
      try {
        const stored = await AsyncStorage.getItem(DISMISSED_UPDATE_KEY);
        if (stored) {
          const { version, timestamp } = JSON.parse(stored);
          const isSameVersion = version === result.latestVersion;
          const withinCooldown = Date.now() - (timestamp || 0) < RECOMMEND_COOLDOWN_MS;
          if (isSameVersion && withinCooldown) {
            setShowModal(false);
            return;
          }
        }
      } catch {}

      setShowModal(true);
    }
  }, []);

  const runCheck = useCallback(async (force = false) => {
    const now = Date.now();
    // Throttle background resume checks unless forced or mandatory
    if (!force && now - lastCheckTimeRef.current < COOLDOWN_MS && updateResult?.updateLevel !== 'mandatory') {
      return;
    }

    lastCheckTimeRef.current = now;
    setIsChecking(true);
    try {
      const res = await checkForAppUpdate();
      if (res.success) {
        await evaluateAndShow(res);
      }
    } finally {
      setIsChecking(false);
    }
  }, [evaluateAndShow, updateResult]);

  // Initial check on cold start
  useEffect(() => {
    runCheck(true);
  }, []);

  // Listen to AppState (handles "users load the app from the app, not particularly starting the app")
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App returned to foreground
        runCheck(false);
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [runCheck]);

  // Dismiss handler (for Recommended updates only)
  const dismissModal = useCallback(async () => {
    if (updateResult?.updateLevel === 'mandatory') {
      // Cannot dismiss mandatory updates
      return;
    }

    setShowModal(false);
    if (updateResult?.latestVersion) {
      try {
        await AsyncStorage.setItem(
          DISMISSED_UPDATE_KEY,
          JSON.stringify({
            version: updateResult.latestVersion,
            timestamp: Date.now(),
          })
        );
      } catch {}
    }
  }, [updateResult]);

  const handleOpenStore = useCallback(() => {
    openPlayStore(updateResult?.playStoreUrl);
  }, [updateResult]);

  return {
    updateResult,
    isChecking,
    showModal,
    updateLevel: updateResult?.updateLevel || 'none',
    dismissModal,
    handleOpenStore,
    checkNow: () => runCheck(true),
  };
}
