// Local Database Service using IndexedDB & LocalStorage
// Provides zero-quota, ultra-fast, local client database storage.

import { Jar, Transaction, BankAccount, CryptoAsset, DebtItem, JarPlanSnapshot, MonthlyCycleSummary, SafetyInvestment, TransactionCategory } from '../types';
import { DEFAULT_APP_PREFERENCES, type AppPreferences } from './preferences';

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

const DB_NAME = 'VietFinanceLocalDB';
const DB_VERSION = 1;
const STORE_NAME = 'app_data';

// Initialize IndexedDB
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Load data from Local Database (IndexedDB with LocalStorage fallback)
export async function loadLocalDatabase(): Promise<Partial<LocalAppData>> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('user_profile');
      req.onsuccess = () => {
        if (req.result) {
          resolve(req.result);
        } else {
          // Fallback to LocalStorage
          resolve(loadFromLocalStorage());
        }
      };
      req.onerror = () => {
        resolve(loadFromLocalStorage());
      };
    });
  } catch (err) {
    return loadFromLocalStorage();
  }
}

// Save data to Local Database (IndexedDB + LocalStorage)
export async function saveLocalDatabase(data: Partial<LocalAppData>): Promise<void> {
  // Always update LocalStorage synchronously for instant access
  saveToLocalStorage(data);

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const existing = (await new Promise((resolve) => {
      const req = store.get('user_profile');
      req.onsuccess = () => resolve(req.result || {});
      req.onerror = () => resolve({});
    })) as Partial<LocalAppData>;

    const updatedData: LocalAppData = {
      monthlyIncome: data.monthlyIncome ?? existing.monthlyIncome ?? 0,
      jars: data.jars ?? existing.jars ?? [],
      archivedJars: data.archivedJars ?? existing.archivedJars ?? [],
      activeJarPlanId: data.activeJarPlanId ?? existing.activeJarPlanId ?? 'custom',
      jarPlanSnapshots: data.jarPlanSnapshots ?? existing.jarPlanSnapshots ?? [],
      transactions: data.transactions ?? existing.transactions ?? [],
      customCategories: data.customCategories ?? existing.customCategories ?? [],
      bankAccounts: data.bankAccounts ?? existing.bankAccounts ?? [],
      cryptoAssets: data.cryptoAssets ?? existing.cryptoAssets ?? [],
      safetyInvestments: data.safetyInvestments ?? existing.safetyInvestments ?? [],
      debtItems: data.debtItems ?? existing.debtItems ?? [],
      isAmountsHidden: data.isAmountsHidden ?? existing.isAmountsHidden ?? false,
      preferences: data.preferences ?? existing.preferences ?? DEFAULT_APP_PREFERENCES,
      activeCycleStart: data.activeCycleStart ?? existing.activeCycleStart ?? '',
      monthlySummaries: data.monthlySummaries ?? existing.monthlySummaries ?? [],
      updatedAt: new Date().toISOString(),
    };

    store.put(updatedData, 'user_profile');
  } catch (err) {
    console.warn('IndexedDB write warning, relied on LocalStorage:', err);
  }
}

function loadFromLocalStorage(): Partial<LocalAppData> {
  try {
    const income = localStorage.getItem('vf_monthly_income');
    const jars = localStorage.getItem('vf_jars');
    const archivedJars = localStorage.getItem('vf_archived_jars');
    const activeJarPlanId = localStorage.getItem('vf_active_jar_plan_id');
    const jarPlanSnapshots = localStorage.getItem('vf_jar_plan_snapshots');
    const transactions = localStorage.getItem('vf_transactions');
    const customCategories = localStorage.getItem('vf_custom_categories');
    const bankAccounts = localStorage.getItem('vf_bank_accounts');
    const cryptoAssets = localStorage.getItem('vf_crypto_assets');
    const safetyInvestments = localStorage.getItem('vf_safety_investments');
    const debtItems = localStorage.getItem('vf_debt_items');
    const isAmountsHidden = localStorage.getItem('vf_hide_amounts');
    const activeCycleStart = localStorage.getItem('vf_active_cycle_start');
    const monthlySummaries = localStorage.getItem('vf_monthly_summaries');

    return {
      monthlyIncome: income ? Number(income) : undefined,
      jars: jars ? JSON.parse(jars) : undefined,
      archivedJars: archivedJars ? JSON.parse(archivedJars) : undefined,
      activeJarPlanId: activeJarPlanId || undefined,
      jarPlanSnapshots: jarPlanSnapshots ? JSON.parse(jarPlanSnapshots) : undefined,
      transactions: transactions ? JSON.parse(transactions) : undefined,
      customCategories: customCategories ? JSON.parse(customCategories) : undefined,
      bankAccounts: bankAccounts ? JSON.parse(bankAccounts) : undefined,
      cryptoAssets: cryptoAssets ? JSON.parse(cryptoAssets) : undefined,
      safetyInvestments: safetyInvestments ? JSON.parse(safetyInvestments) : undefined,
      debtItems: debtItems ? JSON.parse(debtItems) : undefined,
      isAmountsHidden: isAmountsHidden ? JSON.parse(isAmountsHidden) : undefined,
      activeCycleStart: activeCycleStart || undefined,
      monthlySummaries: monthlySummaries ? JSON.parse(monthlySummaries) : undefined,
    };
  } catch (err) {
    return {};
  }
}

function saveToLocalStorage(data: Partial<LocalAppData>): void {
  try {
    if (data.monthlyIncome !== undefined) localStorage.setItem('vf_monthly_income', data.monthlyIncome.toString());
    if (data.jars !== undefined) localStorage.setItem('vf_jars', JSON.stringify(data.jars));
    if (data.archivedJars !== undefined) localStorage.setItem('vf_archived_jars', JSON.stringify(data.archivedJars));
    if (data.activeJarPlanId !== undefined) localStorage.setItem('vf_active_jar_plan_id', data.activeJarPlanId);
    if (data.jarPlanSnapshots !== undefined) localStorage.setItem('vf_jar_plan_snapshots', JSON.stringify(data.jarPlanSnapshots));
    if (data.transactions !== undefined) localStorage.setItem('vf_transactions', JSON.stringify(data.transactions));
    if (data.customCategories !== undefined) localStorage.setItem('vf_custom_categories', JSON.stringify(data.customCategories));
    if (data.bankAccounts !== undefined) localStorage.setItem('vf_bank_accounts', JSON.stringify(data.bankAccounts));
    if (data.cryptoAssets !== undefined) localStorage.setItem('vf_crypto_assets', JSON.stringify(data.cryptoAssets));
    if (data.safetyInvestments !== undefined) localStorage.setItem('vf_safety_investments', JSON.stringify(data.safetyInvestments));
    if (data.debtItems !== undefined) localStorage.setItem('vf_debt_items', JSON.stringify(data.debtItems));
    if (data.isAmountsHidden !== undefined) localStorage.setItem('vf_hide_amounts', JSON.stringify(data.isAmountsHidden));
    if (data.activeCycleStart !== undefined) localStorage.setItem('vf_active_cycle_start', data.activeCycleStart);
    if (data.monthlySummaries !== undefined) localStorage.setItem('vf_monthly_summaries', JSON.stringify(data.monthlySummaries));
  } catch (err) {
    console.error('LocalStorage write error:', err);
  }
}

// Export Database to JSON File
export function exportDatabaseBackup(data: LocalAppData) {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vietfinance_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
