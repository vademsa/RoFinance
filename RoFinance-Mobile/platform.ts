import type { BankAccount, Jar, Transaction } from '../src/types';
import type { AnalyticsCycle } from '../src/utils/analytics';
import { Preferences } from '@capacitor/preferences';
import type { CharacterReceiptStorage } from '../shared/characterReceipt';

export const characterReceiptStorage: CharacterReceiptStorage = {
  keys: async () => (await Preferences.keys()).keys,
  get: async (key) => (await Preferences.get({ key })).value,
  set: async (key, value) => { await Preferences.set({ key, value }); },
  remove: async (key) => { await Preferences.remove({ key }); },
};

export { authApi, dataApi, mobileApiFetch as apiFetch } from './mobileApi';
export type { AuthUser } from './mobileApi';

export const isNativeApp = true;
export const supportsOAuth = false;
export const supportsNativeGoogle = true;
export const supportsReportExport = false;

export async function loadLegacyData() {
  // A native WebView must never import financial records from browser storage.
  return { canImportLegacyData: false, data: null };
}

export function markLegacyImport(_userId: string) {
  // No financial data is stored in WebView localStorage or IndexedDB.
}

type ReportExporter = (
  jars: Jar[], transactions: Transaction[], monthlyIncome: number,
  jarRegistry: Jar[], cycle?: AnalyticsCycle, bankAccounts?: BankAccount[],
) => void;

const unavailable: ReportExporter = () => {
  throw new Error('Xuất báo cáo chỉ hỗ trợ trên bản web.');
};

export const exportToExcel = unavailable;
export const exportToPDFPrint = unavailable;
