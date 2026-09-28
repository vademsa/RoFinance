import { convertVndForDisplay, getRuntimePreferences } from '../lib/preferences';
import { parseLocalDate } from './monthlyCycle';

export function formatVND(amount: number, hideAmount = false): string {
  const preferences = getRuntimePreferences();
  if (hideAmount) return preferences.currency === 'USD' ? '•••••••• $' : '•••••••• ₫';
  return new Intl.NumberFormat(preferences.language === 'en' ? 'en-US' : 'vi-VN', {
    style: 'currency',
    currency: preferences.currency,
    minimumFractionDigits: preferences.currency === 'USD' ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(convertVndForDisplay(amount));
}

export function formatShortVND(amount: number, hideAmount = false): string {
  const preferences = getRuntimePreferences();
  if (preferences.currency === 'USD') {
    const converted = convertVndForDisplay(amount);
    if (hideAmount) return '•••• $';
    return new Intl.NumberFormat(preferences.language === 'en' ? 'en-US' : 'vi-VN', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(converted);
  }
  if (hideAmount) return '•••• ₫';
  if (Math.abs(amount) >= 1_000_000_000) {
    return (amount / 1_000_000_000).toFixed(2).replace(/\.00$/, '') + ' tỷ ₫';
  }
  if (Math.abs(amount) >= 1_000_000) {
    return (amount / 1_000_000).toFixed(2).replace(/\.00$/, '') + ' triệu ₫';
  }
  if (Math.abs(amount) >= 1_000) {
    return (amount / 1_000).toFixed(0) + 'k ₫';
  }
  return amount.toString() + ' ₫';
}

export function formatUSD(amount: number, hideAmount = false): string {
  if (hideAmount) return '•••••••• $';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}

export function formatDateVI(dateString: string): string {

  try {
    const date = parseLocalDate(dateString) || new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat(getRuntimePreferences().language === 'en' ? 'en-US' : 'vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  } catch {
    return dateString;
  }
}
