import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { MOBILE_REFRESH_STORAGE_KEY } from './mobileApi';

const INSTALL_MARKER = 'rofinance-mobile-installed-v1';

export async function initializeMobileStorage() {
  if (!Capacitor.isNativePlatform()) return;
  await SecureStorage.setSynchronize(false);
  const { value } = await Preferences.get({ key: INSTALL_MARKER });
  if (value === '1') return;
  // iOS Keychain may survive uninstall. The ordinary preference does not.
  await SecureStorage.removeItem(MOBILE_REFRESH_STORAGE_KEY);
  await Preferences.set({ key: INSTALL_MARKER, value: '1' });
}
