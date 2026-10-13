import { loadLocalDatabase } from '../lib/localDb';
import { exportToExcel, exportToPDFPrint } from '../utils/exporter';
import type { CharacterReceiptStorage } from '../../shared/characterReceipt';

export { authApi, dataApi } from '../lib/api';
export type { AuthUser } from '../lib/api';
export { exportToExcel, exportToPDFPrint };

export const isNativeApp = false;
export const supportsOAuth = true;
export const supportsNativeGoogle = false;
export const supportsReportExport = true;

export const apiFetch = (path: string, init?: RequestInit) => fetch(path, init);

export const characterReceiptStorage: CharacterReceiptStorage = {
  keys: async () => Object.keys(localStorage),
  get: async (key) => localStorage.getItem(key),
  set: async (key, value) => { localStorage.setItem(key, value); },
  remove: async (key) => { localStorage.removeItem(key); },
};

export async function loadLegacyData() {
  const canImportLegacyData = !localStorage.getItem('vf_postgres_migration_owner');
  return {
    canImportLegacyData,
    data: canImportLegacyData ? await loadLocalDatabase() : null,
  };
}

export function markLegacyImport(userId: string) {
  localStorage.setItem('vf_postgres_migration_owner', userId);
}
