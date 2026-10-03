import type { Jar, Transaction } from '../src/types';
import type { AnalyticsCycle } from '../src/utils/analytics';

export { authApi, dataApi, mobileApiFetch as apiFetch } from './mobileApi';
export type { AuthUser } from './mobileApi';

export const isNativeApp = true;
export const supportsOAuth = false;
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
  jarRegistry: Jar[], cycle?: AnalyticsCycle,
) => void;

const unavailable: ReportExporter = () => {
  throw new Error('Xuất báo cáo chỉ hỗ trợ trên bản web.');
};

export const exportToExcel = unavailable;
export const exportToPDFPrint = unavailable;
