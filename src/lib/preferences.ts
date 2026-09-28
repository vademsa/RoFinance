export type AppLanguage = 'vi' | 'en';
export type AppCurrency = 'VND' | 'USD';
export type AppTheme = 'dark' | 'light' | 'system';

export interface AppPreferences {
  language: AppLanguage;
  currency: AppCurrency;
  theme: AppTheme;
  usdVndRate: number;
  monthlyResetDay: number;
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  language: 'vi',
  currency: 'VND',
  theme: 'dark',
  usdVndRate: 26000,
  monthlyResetDay: 1,
};

let currentPreferences = DEFAULT_APP_PREFERENCES;

export function setRuntimePreferences(preferences: AppPreferences) {
  currentPreferences = preferences;
}

export function getRuntimePreferences() {
  return currentPreferences;
}

export function getDisplayCurrencyCode() {
  return currentPreferences.currency;
}

export function getDisplayCurrencySymbol() {
  return currentPreferences.currency === 'USD' ? '$' : '₫';
}

export function getDisplayLocale() {
  return currentPreferences.language === 'en' ? 'en-US' : 'vi-VN';
}

export function convertVndForDisplay(amount: number) {
  return currentPreferences.currency === 'USD'
    ? amount / Math.max(1, currentPreferences.usdVndRate)
    : amount;
}

export function convertDisplayToVnd(amount: number) {
  return currentPreferences.currency === 'USD'
    ? amount * Math.max(1, currentPreferences.usdVndRate)
    : amount;
}
