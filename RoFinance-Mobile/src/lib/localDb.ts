import type {
  BankAccount, CryptoAsset, DebtItem, Jar, JarPlanSnapshot,
  MonthlyCycleSummary, SafetyInvestment, Transaction, TransactionCategory,
} from '../types';
import type { AppPreferences } from './preferences';

export interface LocalAppData {
  monthlyIncome: number;
  jars: Jar[];
  archivedJars: Jar[];
  activeJarPlanId: string;
  jarPlanSnapshots: JarPlanSnapshot[];
  transactions: Transaction[];
  customCategories: TransactionCategory[];
  bankAccounts: BankAccount[];
  cryptoAssets: CryptoAsset[];
  safetyInvestments: SafetyInvestment[];
  debtItems: DebtItem[];
  isAmountsHidden: boolean;
  preferences: AppPreferences;
  activeCycleStart: string;
  monthlySummaries: MonthlyCycleSummary[];
  updatedAt: string;
}

// Financial records remain on the shared backend. The native app does not
// persist a plaintext copy in WebView IndexedDB or localStorage.
export async function loadLocalDatabase(): Promise<Partial<LocalAppData>> {
  return {};
}
