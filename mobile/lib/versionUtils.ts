import { Linking } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import type { AppUpdateInfo } from '@/lib/types';

export interface CheckUpdateResult {
  success: boolean;
  hasUpdate: boolean;
  currentVersion: string;
  currentVersionCode: number;
  latestVersion?: string;
  latestVersionCode?: number;
  releaseNotes?: string | null;
  playStoreUrl?: string;
  error?: string;
}

/**
 * Compares current version/build against latest published version/build.
 * Prioritizes integer build codes (e.g. versionCode 9 > 8).
 * Falls back to semantic version string comparison (e.g. 1.1.1 > 1.1.0).
 */
export function isUpdateAvailable(
  currentVersion: string,
  currentVersionCode: number,
  latestVersion: string,
  latestVersionCode?: number | null
): boolean {
  if (typeof latestVersionCode === 'number' && latestVersionCode > 0 && currentVersionCode > 0) {
    return latestVersionCode > currentVersionCode;
  }

  // Fallback: Semantic versioning comparison (major.minor.patch)
  const currentParts = (currentVersion || '0.0.0').split('.').map(p => parseInt(p, 10) || 0);
  const latestParts = (latestVersion || '0.0.0').split('.').map(p => parseInt(p, 10) || 0);
  const maxLen = Math.max(currentParts.length, latestParts.length);

  for (let i = 0; i < maxLen; i++) {
    const c = currentParts[i] ?? 0;
    const l = latestParts[i] ?? 0;
    if (l > c) return true;
    if (l < c) return false;
  }

  return false;
}

/**
 * Queries the Supabase app_updates table and compares against the current app build.
 */
export async function checkForAppUpdate(): Promise<CheckUpdateResult> {
  const currentVersion = Constants.expoConfig?.version || '1.1.2';
  const currentVersionCode = Constants.expoConfig?.android?.versionCode || 10;

  try {
    const { data, error } = await supabase
      .from('app_updates')
      .select('*')
      .eq('is_active', true)
      .order('latest_version_code', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('checkForAppUpdate error:', error.message);
      return {
        success: false,
        hasUpdate: false,
        currentVersion,
        currentVersionCode,
        error: error.message,
      };
    }

    if (!data) {
      return {
        success: true,
        hasUpdate: false,
        currentVersion,
        currentVersionCode,
      };
    }

    const updateInfo = data as AppUpdateInfo;
    const hasUpdate = isUpdateAvailable(
      currentVersion,
      currentVersionCode,
      updateInfo.latest_version,
      updateInfo.latest_version_code
    );

    return {
      success: true,
      hasUpdate,
      currentVersion,
      currentVersionCode,
      latestVersion: updateInfo.latest_version,
      latestVersionCode: updateInfo.latest_version_code,
      releaseNotes: updateInfo.release_notes,
      playStoreUrl: updateInfo.play_store_url,
    };
  } catch (err: any) {
    console.error('checkForAppUpdate unhandled exception:', err);
    return {
      success: false,
      hasUpdate: false,
      currentVersion,
      currentVersionCode,
      error: err.message || 'Unknown network error',
    };
  }
}

/**
 * Directs the user to Google Play Store to update the application.
 * Tries the native Play Store app intent (`market://`) first, falling back to HTTPS webpage.
 */
export async function openPlayStore(storeUrl?: string): Promise<void> {
  const defaultPackage = 'com.nudgeforward.dayfuel';
  const marketUrl = `market://details?id=${defaultPackage}`;
  const webUrl = storeUrl || `https://play.google.com/store/apps/details?id=${defaultPackage}`;

  try {
    const canOpen = await Linking.canOpenURL(marketUrl);
    if (canOpen) {
      await Linking.openURL(marketUrl);
    } else {
      await Linking.openURL(webUrl);
    }
  } catch {
    await Linking.openURL(webUrl);
  }
}
