import React, { lazy, Suspense, useCallback, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Jar, Transaction, BankAccount, CryptoAsset, DebtItem, JarPlanSnapshot, MonthlyCycleSummary, SafetyInvestment, TransactionCategory } from './types';
import { CalendarCheck2, LayoutTemplate, Sparkles, X } from 'lucide-react';
import {
  DEFAULT_JARS,
  DEFAULT_BANK_ACCOUNTS,
  INITIAL_TRANSACTIONS,
  DEFAULT_MONTHLY_INCOME,
  DEFAULT_CRYPTO_ASSETS,
  DEFAULT_DEBT_ITEMS,
} from './constants/defaultData';
import { Navbar } from './components/Navbar';
import { JarManagement } from './components/JarManagement';
import { TransactionList } from './components/TransactionList';
import { IncomeAllocatorModal } from './components/IncomeAllocatorModal';
import { TransactionModal } from './components/TransactionModal';
import { TransactionImportModal } from './components/TransactionImportModal';
import { HistoricalBalanceModal } from './components/HistoricalBalanceModal';
import { BankAccountsModal } from './components/BankAccountsModal';
import { BudgetAlertsBanner } from './components/BudgetAlertsBanner';
import { DebtManagementModal } from './components/DebtManagementModal';
import { AuthModal } from './components/AuthModal';
import { BrandLogo } from './components/BrandLogo';
import { MobileEdgeRefresh } from './components/MobileEdgeRefresh';
import { JarPlanSelectorModal } from './components/JarPlanSelectorModal';
import { CommunityPlansModal } from './components/CommunityPlansModal';
import { communityApi } from './lib/communityApi';
import { LegalPage } from './components/LegalPage';
import { TranslationLayer } from './components/TranslationLayer';
import { formatVND } from './utils/formatters';
import {
  apiFetch, authApi, dataApi, exportToExcel, exportToPDFPrint,
  isNativeApp, loadLegacyData, markLegacyImport, supportsReportExport,
  type AuthUser,
} from '@platform';
import {
  AppPreferences,
  DEFAULT_APP_PREFERENCES,
  setRuntimePreferences,
} from './lib/preferences';
import {
  deduplicateBankAccounts,
  editBankAccountDetails,
  getBankOnlyIncomeTotal,
  syncBankAccountsWithJars,
} from './utils/bankAccounts';
import { isBankOnlyIncome } from '../shared/transactions';
import { syncBankIncomeSummaries } from './utils/bankIncome';
import {
  adjustCompletedCycleIncome,
  applyCurrentCycleSpending,
  createMonthlyCycleSummary,
  getBackdatableJarIds,
  getCycleTransactions,
  getExpenseByJar,
  getFinancialCycleStart,
  getNextFinancialCycleStart,
  isDateInCycle,
  parseLocalDate,
  normalizeJarBudgetState,
  rolloverJarBalances,
  setJarCycleAllocation,
  toLocalDateKey,
} from './utils/monthlyCycle';
import {
  addHistoricalOpeningBalance,
  getHistoricalSummaryForDate,
  replayHistoricalBalances,
  type HistoricalCycleChange,
} from './utils/historicalBalances';
import { migrateTransactionPaymentMethods } from './utils/paymentMethods';
import { findBankByCode } from '../shared/banks';
import { CUSTOM_JAR_PLAN_ID, findJarPlan } from './constants/jarPlans';
import { createJarPlanSnapshot, getJarConfigurationSignature, restoreMissingJarPercentages, switchJarPlan } from './utils/jarPlans';
import { useCharacterProfile } from './hooks/useCharacterProfile';
import { useAppUpdates } from './hooks/useAppUpdates';
import { CharacterCompanion } from './components/character/CharacterCompanion';

const AnalyticsCharts = lazy(() => import('./components/AnalyticsCharts').then((module) => ({ default: module.AnalyticsCharts })));
const InvestmentDashboard = lazy(() => import('./components/InvestmentDashboard').then((module) => ({ default: module.InvestmentDashboard })));
const AIAdvisorDrawer = lazy(() => import('./components/AIAdvisorDrawer').then((module) => ({ default: module.AIAdvisorDrawer })));
const CharacterProfile = lazy(() => import('./components/character/CharacterProfile').then((module) => ({ default: module.CharacterProfile })));
const CharacterLeaderboard = lazy(() => import('./components/character/CharacterLeaderboard').then((module) => ({ default: module.CharacterLeaderboard })));

function canonicalizeBankDetails<T extends { bankCode: string; bankName: string }>(item: T): T {
  const normalizedCode = item.bankCode.trim().toUpperCase();
  if (!normalizedCode) {
    return { ...item, bankCode: '', bankName: 'Chưa cấu hình' };
  }
  const bank = findBankByCode(normalizedCode);
  if (!bank) return { ...item, bankCode: normalizedCode };
  return { ...item, bankCode: bank.code, bankName: bank.shortName };
}

function migrateLegacyDebtFees(items: DebtItem[]) {
  let changed = false;
  const migratedItems = items.map((debt) => {
    const fee = debt.conversionFee || 0;
    if (fee > 0 && !debt.calculationMode) {
      changed = true;
      return {
        ...debt,
        totalAmount: debt.totalAmount + fee,
        remainingAmount: debt.remainingAmount + fee,
        calculationMode: 'total' as const,
      };
    }
    return debt;
  });
  return { migratedItems, changed };
}

function migrateMissingDefaultJars(items: Jar[] | undefined, planAware = false) {
  if (!items || items.length === 0) {
    return { migratedItems: DEFAULT_JARS.map(normalizeJarBudgetState), changed: true };
  }
  if (planAware) {
    const migratedItems = items.map((jar) =>
      normalizeJarBudgetState(canonicalizeBankDetails(jar))
    );
    return {
      migratedItems,
      changed: migratedItems.some((jar, index) => JSON.stringify(jar) !== JSON.stringify(items[index])),
    };
  }
  const existingCodes = new Set(items.map((jar) => jar.code));
  const missingDefaults = DEFAULT_JARS.filter((jar) => !existingCodes.has(jar.code));
  const knownJars = DEFAULT_JARS.map(
    (defaultJar) => items.find((jar) => jar.code === defaultJar.code) || { ...defaultJar }
  );
  const customJars = items.filter(
    (jar) => !DEFAULT_JARS.some((defaultJar) => defaultJar.code === jar.code)
  );
  const mergedItems = missingDefaults.length > 0 ? [...knownJars, ...customJars] : items;
  const migratedItems = mergedItems.map((jar) =>
    normalizeJarBudgetState(canonicalizeBankDetails(jar))
  );
  const budgetStateChanged = migratedItems.some((jar, index) =>
    JSON.stringify(jar) !== JSON.stringify(mergedItems[index])
  );
  return {
    migratedItems,
    changed: missingDefaults.length > 0 || budgetStateChanged,
  };
}

export default function App() {
  const legalPage =
    window.location.pathname === '/privacy-policy'
      ? 'privacy'
      : window.location.pathname === '/terms-of-service'
        ? 'terms'
        : null;
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [logoutWarning, setLogoutWarning] = useState('');
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [retryLoadAttempt, setRetryLoadAttempt] = useState(0);
  const isInitialLoadRef = useRef<boolean>(true);
  const pendingCommunityHydrationRef = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastSaveOperationRef = useRef<Promise<void> | null>(null);
  const saveErrorRef = useRef<Error | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const refreshInProgressRef = useRef(false);
  const refreshResolverRef = useRef<{ resolve: () => void; reject: (error: Error) => void } | null>(null);
  const [isRefreshingData, setIsRefreshingData] = useState(false);

  // Financial data comes from the API; only web may import legacy local data.
  const [monthlyIncome, setMonthlyIncome] = useState<number>(DEFAULT_MONTHLY_INCOME);

  const [jars, setJars] = useState<Jar[]>(DEFAULT_JARS);
  const [archivedJars, setArchivedJars] = useState<Jar[]>([]);
  const [activeJarPlanId, setActiveJarPlanId] = useState(CUSTOM_JAR_PLAN_ID);
  const [jarPlanSnapshots, setJarPlanSnapshots] = useState<JarPlanSnapshot[]>([]);

  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [customCategories, setCustomCategories] = useState<TransactionCategory[]>([]);

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(DEFAULT_BANK_ACCOUNTS);

  const [cryptoAssets, setCryptoAssets] = useState<CryptoAsset[]>(DEFAULT_CRYPTO_ASSETS);
  const [safetyInvestments, setSafetyInvestments] = useState<SafetyInvestment[]>([]);

  const [debtItems, setDebtItems] = useState<DebtItem[]>(DEFAULT_DEBT_ITEMS);

  const [isAmountsHidden, setIsAmountsHidden] = useState<boolean>(false);
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_APP_PREFERENCES);
  const [activeCycleStart, setActiveCycleStart] = useState('');
  const [monthlySummaries, setMonthlySummaries] = useState<MonthlyCycleSummary[]>([]);
  const [rolloverNotice, setRolloverNotice] = useState<MonthlyCycleSummary | null>(null);
  const [cycleCheckTick, setCycleCheckTick] = useState(0);
  setRuntimePreferences(preferences);

  const [characterRefreshKey, setCharacterRefreshKey] = useState(0);
  const characterController = useCharacterProfile(user && !isDataLoading ? user.id : null, characterRefreshKey);
  const characterFinance = { jars, archivedJars, monthlyIncome, transactions, monthlySummaries, activeCycleStart, preferences };
  const [activeTab, setActiveTab] = useState<'jars' | 'transactions' | 'crypto' | 'analytics' | 'character'>('jars');
  const mobileContentRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (isNativeApp) mobileContentRef.current?.scrollTo(0, 0);
  }, [activeTab]);

  const selectTab = (tab: typeof activeTab) => {
    if (isNativeApp && tab === activeTab) mobileContentRef.current?.scrollTo(0, 0);
    setActiveTab(tab);
  };

  // Modals state
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [transactionImportMode, setTransactionImportMode] = useState<'statement' | 'bulk' | null>(null);
  const [historicalBalanceDate, setHistoricalBalanceDate] = useState<string | null>(null);
  const [selectedTransactionJarId, setSelectedTransactionJarId] = useState<string | null>(null);
  const [initialTransactionDate, setInitialTransactionDate] = useState<string | undefined>();
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isBankAccountsModalOpen, setIsBankAccountsModalOpen] = useState(false);
  const [isAIAdvisorOpen, setIsAIAdvisorOpen] = useState(false);
  const aiLauncherRef = useRef<HTMLButtonElement>(null);
  const aiPreviousFocusRef = useRef<HTMLElement | null>(null);
  const openAIAdvisor = useCallback(() => {
    aiPreviousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    setIsAIAdvisorOpen(true);
  }, []);
  const closeAIAdvisor = useCallback(() => {
    setIsAIAdvisorOpen(false);
    window.requestAnimationFrame(() => {
      const previous = aiPreviousFocusRef.current;
      if (previous?.isConnected) previous.focus();
      else aiLauncherRef.current?.focus();
    });
  }, []);
  const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isJarPlanModalOpen, setIsJarPlanModalOpen] = useState(false);
  const [isCommunityModalOpen, setIsCommunityModalOpen] = useState(false);
  const [dailyRewardNotice, setDailyRewardNotice] = useState(false);
  const [planChangeNotice, setPlanChangeNotice] = useState<{
    name: string;
    transferredAmount: number;
    archivedCount: number;
  } | null>(null);

  const handleAuthChanged = (nextUser: AuthUser | null, expectedUserId?: string | null) => {
    if (expectedUserId !== undefined && currentUserIdRef.current !== expectedUserId) return;
    if (nextUser) setLogoutWarning('');
    if (nextUser?.id !== user?.id) {
      refreshResolverRef.current?.reject(new Error('Tài khoản đã thay đổi trong lúc tải dữ liệu.'));
      refreshResolverRef.current = null;
      refreshInProgressRef.current = false;
      setIsRefreshingData(false);
      saveErrorRef.current = null;
      setIsDataLoading(Boolean(nextUser));
      setLoadedUserId(null);
      setDataError('');
      isInitialLoadRef.current = true;
      pendingCommunityHydrationRef.current = false;
      setIsCommunityModalOpen(false);
      setDailyRewardNotice(false);
      currentUserIdRef.current = nextUser?.id || null;
      setMonthlyIncome(DEFAULT_MONTHLY_INCOME);
      setJars(DEFAULT_JARS);
      setArchivedJars([]);
      setActiveJarPlanId(CUSTOM_JAR_PLAN_ID);
      setJarPlanSnapshots([]);
      setTransactions(INITIAL_TRANSACTIONS);
      setCustomCategories([]);
      setBankAccounts(DEFAULT_BANK_ACCOUNTS);
      setCryptoAssets(DEFAULT_CRYPTO_ASSETS);
      setSafetyInvestments([]);
      setDebtItems(DEFAULT_DEBT_ITEMS);
      setIsAmountsHidden(false);
      setPreferences(DEFAULT_APP_PREFERENCES);
      setActiveCycleStart('');
      setMonthlySummaries([]);
      setRolloverNotice(null);
      setPlanChangeNotice(null);
      setIsIncomeModalOpen(false);
      setIsTransactionModalOpen(false);
      setIsBankAccountsModalOpen(false);
      setIsAIAdvisorOpen(false);
      setIsDebtModalOpen(false);
      setIsJarPlanModalOpen(false);
      setSelectedTransactionJarId(null);
      setEditingTransaction(null);
    }
    setUser(nextUser);
  };

  // Restore the server-side session.
  useEffect(() => {
    authApi.me()
      .then(({ user: currentUser }) => {
        currentUserIdRef.current = currentUser?.id || null;
        setUser(currentUser);
      })
      .catch(() => {
        currentUserIdRef.current = null;
        setUser(null);
      })
      .finally(() => setIsAuthLoading(false));
  }, []);

  // Load account data. Existing local data is imported once for a new account.
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      isInitialLoadRef.current = true;
      setLoadedUserId(null);
      setIsDataLoading(false);
      return;
    }
    async function initAccountData() {
      const backgroundRefresh = refreshInProgressRef.current;
      isInitialLoadRef.current = true;
      if (!backgroundRefresh) {
        setLoadedUserId(null);
        setIsDataLoading(true);
      }
      setDataError('');
      try {
        const { data: serverData } = await dataApi.load(user.id);
        if (cancelled) return;
        if (backgroundRefresh && !serverData) {
          throw new Error('Không tìm thấy dữ liệu đã lưu trên server. Dữ liệu hiện tại được giữ nguyên.');
        }
        const { data: legacyData, canImportLegacyData } = serverData
          ? { data: null, canImportLegacyData: false }
          : await loadLegacyData();
        if (cancelled) return;
        const data = serverData || legacyData || {
          monthlyIncome: DEFAULT_MONTHLY_INCOME,
          jars: DEFAULT_JARS,
          archivedJars: [],
          activeJarPlanId: CUSTOM_JAR_PLAN_ID,
          jarPlanSnapshots: [],
          transactions: INITIAL_TRANSACTIONS,
          customCategories: [],
          bankAccounts: DEFAULT_BANK_ACCOUNTS,
          cryptoAssets: DEFAULT_CRYPTO_ASSETS,
          safetyInvestments: [],
          debtItems: DEFAULT_DEBT_ITEMS,
          isAmountsHidden: false,
          preferences: DEFAULT_APP_PREFERENCES,
          activeCycleStart: '',
          monthlySummaries: [],
        };
        if (data.monthlyIncome !== undefined) setMonthlyIncome(data.monthlyIncome);
        if (data.isAmountsHidden !== undefined) setIsAmountsHidden(data.isAmountsHidden);
        const nextPreferences = { ...DEFAULT_APP_PREFERENCES, ...data.preferences };
        setPreferences(nextPreferences);
        const currentCycleKey = toLocalDateKey(
          getFinancialCycleStart(new Date(), nextPreferences.monthlyResetDay)
        );
        const storedCycleStart = data.activeCycleStart || currentCycleKey;
        const storedSummaries = Array.isArray(data.monthlySummaries) ? data.monthlySummaries : [];
        setActiveCycleStart(storedCycleStart);
        setMonthlySummaries(storedSummaries);
        const jarMigration = migrateMissingDefaultJars(data.jars, Boolean(data.activeJarPlanId));
        const loadedArchivedJars = Array.isArray(data.archivedJars)
          ? data.archivedJars.map((jar) => normalizeJarBudgetState(canonicalizeBankDetails(jar)))
          : [];
        const loadedActiveJarPlanId = typeof data.activeJarPlanId === 'string'
          ? data.activeJarPlanId
          : CUSTOM_JAR_PLAN_ID;
        const loadedJarPlanSnapshots = Array.isArray(data.jarPlanSnapshots)
          ? data.jarPlanSnapshots
          : [];
        const transactionMigration = migrateTransactionPaymentMethods(
          data.transactions || INITIAL_TRANSACTIONS,
          [...jarMigration.migratedItems, ...loadedArchivedJars],
        );
        const loadedTransactions = transactionMigration.migratedItems;
        const normalizedJars = applyCurrentCycleSpending(
          jarMigration.migratedItems,
          loadedTransactions,
          nextPreferences.monthlyResetDay,
        );
        const activeCodes = new Set(normalizedJars.map((jar) => jar.code));
        const matchesActiveCodes = (items: { code: string }[]) => (
          items.length === normalizedJars.length &&
          items.every((item) => activeCodes.has(item.code))
        );
        const activePlanWeights = findJarPlan(loadedActiveJarPlanId)?.allocations;
        const snapshotWeights = [...loadedJarPlanSnapshots]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .find((snapshot) => matchesActiveCodes(snapshot.jars))
          ?.jars.map((jar) => ({ code: jar.code, weight: jar.percentage }));
        const summaryWeights = [...storedSummaries]
          .sort((a, b) => b.cycleStart.localeCompare(a.cycleStart))
          .map((summary) => summary.jarBreakdown
            ?.filter((item) => !item.isArchived)
            .map((item) => ({ code: item.jarCode, weight: item.cycleAllocation })))
          .find((items): items is { code: string; weight: number }[] => (
            Boolean(items && matchesActiveCodes(items))
          ));
        const defaultWeights = DEFAULT_JARS
          .filter((jar) => activeCodes.has(jar.code))
          .map((jar) => ({ code: jar.code, weight: jar.percentage }));
        const percentageReference = activePlanWeights && matchesActiveCodes(activePlanWeights)
          ? activePlanWeights.map((item) => ({ code: item.code, weight: item.percentage }))
          : snapshotWeights || summaryWeights || (matchesActiveCodes(defaultWeights) ? defaultWeights : []);
        const percentageRepair = restoreMissingJarPercentages(normalizedJars, percentageReference);
        const readyJars = percentageRepair.jars;
        const spendingNormalizationChanged = normalizedJars.some(
          (jar, index) => jar.currentSpent !== jarMigration.migratedItems[index]?.currentSpent
        );
        setJars(readyJars);
        setArchivedJars(loadedArchivedJars);
        setActiveJarPlanId(loadedActiveJarPlanId);
        setJarPlanSnapshots(loadedJarPlanSnapshots);
        setTransactions(loadedTransactions);
        const loadedCustomCategories = Array.isArray(data.customCategories) ? data.customCategories : [];
        setCustomCategories(loadedCustomCategories);
        const normalizedBankAccounts = (data.bankAccounts || DEFAULT_BANK_ACCOUNTS)
          .map(canonicalizeBankDetails);
        const bankAccountMigrationChanged = normalizedBankAccounts.some(
          (account, index) => JSON.stringify(account) !== JSON.stringify(data.bankAccounts?.[index])
        );
        setBankAccounts(normalizedBankAccounts);
        if (data.cryptoAssets) setCryptoAssets(data.cryptoAssets);
        if (data.safetyInvestments) setSafetyInvestments(data.safetyInvestments);
        const debtMigration = data.debtItems
          ? migrateLegacyDebtFees(data.debtItems)
          : { migratedItems: undefined, changed: false };
        if (debtMigration.migratedItems) setDebtItems(debtMigration.migratedItems);
        const cycleMigrationChanged =
          !data.activeCycleStart ||
          !Array.isArray(data.monthlySummaries) ||
          !Array.isArray(data.customCategories) ||
          !Array.isArray(data.archivedJars) ||
          !Array.isArray(data.jarPlanSnapshots) ||
          typeof data.activeJarPlanId !== 'string' ||
          data.preferences?.monthlyResetDay === undefined;
        const normalizedData = {
          ...data,
          jars: readyJars,
          archivedJars: loadedArchivedJars,
          activeJarPlanId: loadedActiveJarPlanId,
          jarPlanSnapshots: loadedJarPlanSnapshots,
          bankAccounts: normalizedBankAccounts,
          transactions: loadedTransactions,
          customCategories: loadedCustomCategories,
          debtItems: debtMigration.migratedItems || data.debtItems,
          preferences: nextPreferences,
          activeCycleStart: storedCycleStart,
          monthlySummaries: storedSummaries,
        };
        if (
          !serverData ||
          debtMigration.changed ||
          jarMigration.changed ||
          transactionMigration.changed ||
          bankAccountMigrationChanged ||
          cycleMigrationChanged ||
          spendingNormalizationChanged ||
          percentageRepair.changed
        ) {
          await dataApi.save(user.id, normalizedData);
          if (cancelled) return;
          if (canImportLegacyData) markLegacyImport(user.id);
        }
        if (!serverData && (
          !canImportLegacyData || !Array.isArray(data.jars) || data.jars.length === 0
        )) {
          setIsJarPlanModalOpen(true);
        }
        isInitialLoadRef.current = false;
        pendingCommunityHydrationRef.current = false;
        setLoadedUserId(user.id);
        if (backgroundRefresh) refreshResolverRef.current?.resolve();
      } catch (error: any) {
        if (!cancelled) {
          const failure = error instanceof Error ? error : new Error('Không thể tải dữ liệu tài khoản');
          setDataError(failure.message);
          if (backgroundRefresh) {
            isInitialLoadRef.current = pendingCommunityHydrationRef.current;
            refreshResolverRef.current?.reject(failure);
          }
        }
      } finally {
        if (!cancelled && !backgroundRefresh) setIsDataLoading(false);
      }
    }
    initAccountData();
    return () => { cancelled = true; };
  }, [user?.id, retryLoadAttempt]);

  // Persist account changes to PostgreSQL (debounced).
  const queueDataSave = (ownerId: string, data: Parameters<typeof dataApi.save>[1]) => {
    if (pendingCommunityHydrationRef.current) return Promise.reject(new Error('Tải lại dữ liệu trước khi lưu.'));
    const operation = saveQueueRef.current
      .catch(() => undefined)
      .then(() => {
        if (pendingCommunityHydrationRef.current) throw new Error('Tải lại dữ liệu trước khi lưu.');
        return currentUserIdRef.current === ownerId ? dataApi.save(ownerId, data).then((result) => {
        if (currentUserIdRef.current === ownerId) {
          setCharacterRefreshKey((current) => current + 1);
          if (result.dailyRewardGranted === true) setDailyRewardNotice(true);
        }
        }) : undefined;
      })
      .then(() => undefined);
    lastSaveOperationRef.current = operation;
    void operation.then(
      () => {
        if (lastSaveOperationRef.current === operation) lastSaveOperationRef.current = null;
        saveErrorRef.current = null;
      },
      (error) => {
        if (lastSaveOperationRef.current === operation) lastSaveOperationRef.current = null;
        saveErrorRef.current = error instanceof Error ? error : new Error('Không thể lưu dữ liệu');
      },
    );
    saveQueueRef.current = operation.catch(() => undefined);
    return operation;
  };

  const refreshAccountData = async () => {
    if (!user || loadedUserId !== user.id || refreshInProgressRef.current) return;
    refreshInProgressRef.current = true;
    setIsRefreshingData(true);
    isInitialLoadRef.current = true;
    let shouldSaveBeforeLoad = saveTimerRef.current !== null || Boolean(saveErrorRef.current);
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    try {
      if (lastSaveOperationRef.current) {
        try {
          await lastSaveOperationRef.current;
        } catch {
          shouldSaveBeforeLoad = true;
        }
      }
      if (currentUserIdRef.current !== user.id) throw new Error('Tài khoản đã thay đổi.');
      if (shouldSaveBeforeLoad && !pendingCommunityHydrationRef.current) {
        await queueDataSave(user.id, {
          monthlyIncome, jars, archivedJars, activeJarPlanId, jarPlanSnapshots,
          transactions, bankAccounts, cryptoAssets, safetyInvestments, debtItems,
          isAmountsHidden, preferences, activeCycleStart, monthlySummaries, customCategories,
        });
      }
      await new Promise<void>((resolve, reject) => {
        refreshResolverRef.current = { resolve, reject };
        setRetryLoadAttempt((value) => value + 1);
      });
    } catch (error) {
      const failure = error instanceof Error ? error : new Error('Không thể tải lại dữ liệu');
      if (currentUserIdRef.current === user.id) setDataError(failure.message);
      throw failure;
    } finally {
      refreshResolverRef.current = null;
      refreshInProgressRef.current = false;
      setIsRefreshingData(false);
      if (currentUserIdRef.current === user.id) isInitialLoadRef.current = pendingCommunityHydrationRef.current;
    }
  };

  const handleCommunityAdopt = async (planId: string, requestId: string) => {
    if (!user || loadedUserId !== user.id || refreshInProgressRef.current || pendingCommunityHydrationRef.current) throw new Error('ACCOUNT_CHANGED');
    const ownerId = user.id;
    refreshInProgressRef.current = true;
    setIsRefreshingData(true);
    isInitialLoadRef.current = true;
    if (saveTimerRef.current !== null) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    let committed = false, hydrated = false;
    try {
      await queueDataSave(ownerId, {
        monthlyIncome, jars, archivedJars, activeJarPlanId, jarPlanSnapshots,
        transactions, bankAccounts, cryptoAssets, safetyInvestments, debtItems,
        isAmountsHidden, preferences, activeCycleStart, monthlySummaries, customCategories,
      });
      if (currentUserIdRef.current !== ownerId) throw new Error('ACCOUNT_CHANGED');
      const revision = dataApi.revision(ownerId);
      if (revision === undefined) throw new Error('INVALID_REVISION');
      pendingCommunityHydrationRef.current = true;
      const result = await communityApi.adopt(planId, requestId, revision, ownerId);
      committed = true;
      if (currentUserIdRef.current !== ownerId) throw new Error('ACCOUNT_CHANGED');
      void result; // dataApi.load updates the web/native revision only while rehydrating.
      // Reload directly: refreshAccountData would first save the obsolete local plan.
      await new Promise<void>((resolve, reject) => { refreshResolverRef.current = { resolve, reject }; setRetryLoadAttempt(v => v + 1); });
      if (currentUserIdRef.current !== ownerId) throw new Error('ACCOUNT_CHANGED');
      hydrated = true;
      pendingCommunityHydrationRef.current = false;
      setIsCommunityModalOpen(false);
      setCharacterRefreshKey(v => v + 1);
    } catch (e) {
      if (pendingCommunityHydrationRef.current && currentUserIdRef.current === ownerId) setDataError(preferences.language === 'en' ? (committed ? 'Template saved. Reload data before making more changes.' : 'Adoption result could not be confirmed. Reload data before making more changes.') : (committed ? 'Đã lưu mẫu. Hãy tải lại dữ liệu trước khi chỉnh sửa tiếp.' : 'Chưa xác nhận được kết quả áp dụng mẫu. Hãy tải lại dữ liệu trước khi chỉnh sửa tiếp.'));
      throw e;
    } finally {
      if (currentUserIdRef.current === ownerId) {
        refreshResolverRef.current = null; refreshInProgressRef.current = false; setIsRefreshingData(false);
        isInitialLoadRef.current = pendingCommunityHydrationRef.current && !hydrated;
      }
    }
  };

  useEffect(() => {
    if (!user || isInitialLoadRef.current) return;
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      queueDataSave(user.id, {
        monthlyIncome,
        jars,
        archivedJars,
        activeJarPlanId,
        jarPlanSnapshots,
        transactions,
        bankAccounts,
        cryptoAssets,
        safetyInvestments,
        debtItems,
        isAmountsHidden,
        preferences,
        activeCycleStart,
        monthlySummaries,
        customCategories,
      })
        .then(() => { if (currentUserIdRef.current === user.id) setDataError(''); })
        .catch((error) => { if (currentUserIdRef.current === user.id) setDataError(error.message); });
    }, 400);
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    };
  }, [
    monthlyIncome,
    jars,
    archivedJars,
    activeJarPlanId,
    jarPlanSnapshots,
    transactions,
    bankAccounts,
    cryptoAssets,
    safetyInvestments,
    debtItems,
    isAmountsHidden,
    preferences,
    activeCycleStart,
    monthlySummaries,
    customCategories,
    user?.id,
  ]);

  // Close completed cycles on the first app tick after the configured reset date.
  useEffect(() => {
    if (!user || isDataLoading || isInitialLoadRef.current || !activeCycleStart) return;

    const now = new Date();
    const currentCycleStart = getFinancialCycleStart(now, preferences.monthlyResetDay);
    const currentCycleKey = toLocalDateKey(currentCycleStart);
    if (activeCycleStart === currentCycleKey) {
      const nextReset = getNextFinancialCycleStart(currentCycleStart, preferences.monthlyResetDay);
      const delay = Math.min(
        Math.max(1_000, nextReset.getTime() - now.getTime() + 1_000),
        2_147_000_000,
      );
      const timer = window.setTimeout(() => setCycleCheckTick((tick) => tick + 1), delay);
      return () => window.clearTimeout(timer);
    }

    const storedCycleStart = parseLocalDate(activeCycleStart);
    if (!storedCycleStart || storedCycleStart > currentCycleStart) {
      setActiveCycleStart(currentCycleKey);
      return;
    }

    const completedSummaries: MonthlyCycleSummary[] = [];
    let cursor = storedCycleStart;
    let rollingJars = jars.map(normalizeJarBudgetState);
    let rollingIncome = monthlyIncome;
    let guard = 0;
    while (cursor < currentCycleStart && guard < 120) {
      const nextCycleStart = getNextFinancialCycleStart(cursor, preferences.monthlyResetDay);
      if (nextCycleStart > currentCycleStart) break;
      const cycleExpenses = getExpenseByJar(getCycleTransactions(
        transactions,
        cursor,
        nextCycleStart,
      ));
      const activeIds = new Set(rollingJars.map((jar) => jar.id));
      const archivedSummaryJars = archivedJars
        .filter((jar) => !activeIds.has(jar.id) && (cycleExpenses[jar.id] || 0) > 0)
        .map((jar) => ({ ...normalizeJarBudgetState(jar), currentSpent: cycleExpenses[jar.id] || 0 }));
      const archivedSummaryJarIds = new Set(archivedSummaryJars.map((jar) => jar.id));
      completedSummaries.push(createMonthlyCycleSummary(
        cursor,
        nextCycleStart,
        transactions,
        [...rollingJars, ...archivedSummaryJars],
        rollingIncome,
        archivedSummaryJarIds,
      ));
      rollingJars = rolloverJarBalances(
        rollingJars,
        transactions,
        cursor,
        nextCycleStart,
      );
      rollingIncome = 0;
      cursor = nextCycleStart;
      guard += 1;
    }

    if (completedSummaries.length > 0) {
      const completedIds = new Set(completedSummaries.map((summary) => summary.id));
      setMonthlySummaries((current) => [
        ...current.filter((summary) => !completedIds.has(summary.id)),
        ...completedSummaries,
      ].sort((a, b) => a.cycleStart.localeCompare(b.cycleStart)));
      setRolloverNotice(completedSummaries[completedSummaries.length - 1]);
    }

    setJars(applyCurrentCycleSpending(
      rollingJars,
      transactions,
      preferences.monthlyResetDay,
      now,
    ));
    setMonthlyIncome(0);
    setActiveCycleStart(currentCycleKey);
  }, [
    activeCycleStart,
    archivedJars,
    cycleCheckTick,
    isDataLoading,
    jars,
    monthlyIncome,
    preferences.monthlyResetDay,
    transactions,
    user,
  ]);

  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = () => {
      const resolvedTheme =
        preferences.theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: light)').matches
            ? 'light'
            : 'dark'
          : preferences.theme;
      root.dataset.theme = resolvedTheme;
      root.lang = preferences.language;
    };
    applyTheme();
    const media = window.matchMedia('(prefers-color-scheme: light)');
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [preferences.language, preferences.theme]);

  useEffect(() => {
    if (!user || isInitialLoadRef.current) return;
    setBankAccounts((currentAccounts) => syncBankAccountsWithJars(jars, currentAccounts, transactions));
  }, [isDataLoading, jars, transactions, user]);

  const updatePending = useAppUpdates(() => {
    // Let drafts, debounced saves, receipt persistence and result animations finish.
    // Never discard unsaved finance after an offline/conflicting save failure.
    return !isAuthLoading && (!user || !isDataLoading) && !isRefreshingData && !pendingCommunityHydrationRef.current && !characterController.busy
      && saveTimerRef.current === null && lastSaveOperationRef.current === null && !saveErrorRef.current
      && !isIncomeModalOpen && !isTransactionModalOpen && !transactionImportMode && !historicalBalanceDate
      && !isBankAccountsModalOpen && !isDebtModalOpen && !isAuthModalOpen && !isJarPlanModalOpen && !isCommunityModalOpen && !isAIAdvisorOpen
      && !document.querySelector('[role="dialog"], [aria-modal="true"], dialog[open], .fixed.inset-0, [data-unsaved-changes="true"]')
      && !(document.activeElement instanceof HTMLElement && document.activeElement.matches('input, textarea, select, [contenteditable="true"]'));
  }, async () => {
    await refreshAccountData();
    await characterController.refresh();
    setCharacterRefreshKey((value) => value + 1);
  });

  if (isAuthLoading) {
    if (legalPage) {
      return (
        <>
          <TranslationLayer language={preferences.language} currency={preferences.currency} />
          <LegalPage type={legalPage} />
        </>
      );
    }
    return <div className="min-h-screen bg-[#09090b] text-zinc-300 flex items-center justify-center">Đang kiểm tra phiên đăng nhập...</div>;
  }

  if (legalPage) {
    return (
      <>
        <TranslationLayer language={preferences.language} currency={preferences.currency} />
        <LegalPage type={legalPage} />
      </>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <BrandLogo className="mx-auto h-24 w-24"/>
          <h1 className="text-3xl font-black">RoFinance</h1>
          <p className="text-sm text-zinc-400">Đăng nhập để truy cập dữ liệu và các chức năng tài chính.</p>
          {logoutWarning && <p role="alert" className="max-w-md rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">{logoutWarning}</p>}
          <button onClick={() => setIsAuthModalOpen(true)} className="px-5 py-3 bg-indigo-600 rounded-xl font-bold">
            Đăng nhập / Tạo tài khoản
          </button>
          <div className="flex items-center justify-center gap-4 text-xs text-zinc-500">
            <a href="/privacy-policy" className="hover:text-indigo-400">Chính sách quyền riêng tư</a>
            <a href="/terms-of-service" className="hover:text-indigo-400">Điều khoản sử dụng</a>
          </div>
        </div>
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          user={null}
          onAuthChanged={handleAuthChanged}
          onLogoutWarning={setLogoutWarning}
        />
      </div>
    );
  }

  if (isDataLoading) {
    return <div className="min-h-screen bg-[#09090b] text-zinc-300 flex items-center justify-center">Đang tải dữ liệu tài khoản...</div>;
  }

  if (loadedUserId !== user.id) {
    return (
      <div className="min-h-screen bg-[#09090b] p-4 text-zinc-100 flex items-center justify-center">
        <div role="alert" className="w-full max-w-md space-y-4 rounded-2xl border border-rose-500/30 bg-[#18181b] p-6 text-center">
          <h1 className="text-lg font-bold">Không thể tải dữ liệu tài khoản</h1>
          <p className="text-sm text-rose-300">{dataError || 'Vui lòng thử lại.'}</p>
          <div className="flex justify-center gap-3">
            <button type="button" onClick={() => setRetryLoadAttempt((value) => value + 1)} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white">Thử lại</button>
            <button type="button" onClick={() => setIsAuthModalOpen(true)} className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-bold">Tài khoản</button>
          </div>
        </div>
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} user={user} onAuthChanged={handleAuthChanged} onLogoutWarning={setLogoutWarning} />
      </div>
    );
  }

  // Handlers
  const mergeJarCycleAllocationUpdates = (currentJars: Jar[], updatedJars: Jar[]) => {
    const updatesById = new Map(updatedJars.map((jar) => [jar.id, jar]));
    return currentJars.map((jar) => {
      const update = updatesById.get(jar.id);
      return update
        ? setJarCycleAllocation(
            { ...jar, percentage: update.percentage },
            update.cycleAllocation ?? update.targetBudget,
          )
        : jar;
    });
  };

  const handleApplyAllocation = (newIncome: number, updatedJars: Jar[]) => {
    if (updatedJars.some((updated) =>
      jars.find((jar) => jar.id === updated.id)?.percentage !== updated.percentage
    )) setActiveJarPlanId(CUSTOM_JAR_PLAN_ID);
    setMonthlyIncome(newIncome);
    setJars((current) => applyCurrentCycleSpending(
      mergeJarCycleAllocationUpdates(current, updatedJars),
      transactions,
      preferences.monthlyResetDay,
    ));
  };

  const handleUpdateJar = async (updatedJar: Jar) => {
    const percentageChanged = jars.find((jar) => jar.id === updatedJar.id)?.percentage !== updatedJar.percentage;
    const nextActiveJarPlanId = percentageChanged ? CUSTOM_JAR_PLAN_ID : activeJarPlanId;
    const updatedJars = applyCurrentCycleSpending(
      jars.map((jar) => {
        if (jar.id !== updatedJar.id) return jar;
        const carryovers = normalizeJarBudgetState(jar).carryovers || [];
        const cycleAllocation = updatedJar.cycleAllocation ?? Math.max(
          0,
          updatedJar.targetBudget - carryovers.reduce((total, item) => total + item.amount, 0),
        );
        return setJarCycleAllocation(
          { ...updatedJar, carryovers, currentSpent: jar.currentSpent },
          cycleAllocation,
        );
      }),
      transactions,
      preferences.monthlyResetDay,
    );
    setJars(updatedJars);
    if (percentageChanged) setActiveJarPlanId(nextActiveJarPlanId);
    setDataError('');
    await queueDataSave(user.id, {
      monthlyIncome,
      jars: updatedJars,
      archivedJars,
      activeJarPlanId: nextActiveJarPlanId,
      jarPlanSnapshots,
      transactions,
      bankAccounts,
      cryptoAssets,
      safetyInvestments,
      debtItems,
      isAmountsHidden,
      preferences,
      activeCycleStart,
      monthlySummaries,
      customCategories,
    }).catch((error) => {
      setDataError(error.message || 'Không thể lưu cấu hình hũ');
      throw error;
    });
  };

  const handleSwitchJarPlan = (selection: { planId?: string; snapshotId?: string }) => {
    const targetPlan = selection.planId ? findJarPlan(selection.planId) : undefined;
    const targetSnapshot = selection.snapshotId
      ? jarPlanSnapshots.find((snapshot) => snapshot.id === selection.snapshotId)
      : undefined;
    if (!targetPlan && !targetSnapshot) {
      setDataError('Không tìm thấy kiểu phân bổ đã chọn.');
      return;
    }

    const now = new Date();
    const currentPlanName = findJarPlan(activeJarPlanId)?.name
      || jarPlanSnapshots.find((snapshot) => `snapshot-${snapshot.id}` === activeJarPlanId)?.name
      || 'Cấu hình tùy chỉnh';
    const snapshot = createJarPlanSnapshot(
      jars,
      activeJarPlanId,
      `${currentPlanName} · ${now.toLocaleString('vi-VN')}`,
      now,
    );
    const result = switchJarPlan({
      currentJars: jars,
      archivedJars,
      targetPlan,
      targetSnapshot,
      transactions,
      resetDay: preferences.monthlyResetDay,
      now,
    });
    const nextPlanId = targetPlan?.id || `snapshot-${targetSnapshot!.id}`;
    setJars(result.activeJars);
    setArchivedJars(result.archivedJars);
    setJarPlanSnapshots((current) => {
      const signature = getJarConfigurationSignature(snapshot.jars);
      return current.some((saved) => getJarConfigurationSignature(saved.jars) === signature)
        ? current
        : [...current, snapshot];
    });
    setActiveJarPlanId(nextPlanId);
    setPlanChangeNotice({
      name: targetPlan?.name || targetSnapshot!.name,
      transferredAmount: result.transferredAmount,
      archivedCount: result.removedJars.length,
    });
    setDataError('');
    setIsJarPlanModalOpen(false);
  };

  const commitTransactionChanges = (
    changes: { previous: Transaction | null; next: Transaction | null }[],
  ) => {
    const currentCycleStart = getFinancialCycleStart(new Date(), preferences.monthlyResetDay);
    const currentCycleEnd = getNextFinancialCycleStart(currentCycleStart, preferences.monthlyResetDay);
    const activeJarIds = new Set(jars.map((jar) => jar.id));
    const todayKey = toLocalDateKey(new Date());
    const currentKey = toLocalDateKey(currentCycleStart);
    const isCurrent = (transaction: Transaction) => isDateInCycle(
      transaction.date,
      currentCycleStart,
      currentCycleEnd,
    );
    const isHistorical = (transaction: Transaction) => Boolean(
      parseLocalDate(transaction.date) && transaction.date < currentKey,
    );
    const historicalIds = (transaction: Transaction) => new Set(
      [...getBackdatableJarIds(getHistoricalSummaryForDate(monthlySummaries, transaction.date,
        preferences.monthlyResetDay))].filter((id) => activeJarIds.has(id)),
    );
    const allocationsAreValid = (transaction: Transaction, allowedJarIds: Set<string>) => {
      if (transaction.type !== 'income' || !transaction.allocations?.length) return false;
      const allocationIds = transaction.allocations.map((item) => item.jarId);
      return new Set(allocationIds).size === allocationIds.length &&
        transaction.allocations.every((item) => (
          allowedJarIds.has(item.jarId) && Number.isFinite(item.amount) && item.amount > 0
        )) &&
        transaction.allocations.reduce((total, item) => total + item.amount, 0) === transaction.amount;
    };
    const validateNextTransaction = (transaction: Transaction) => {
      if (transaction.date > todayKey) return 'Ngày giao dịch không được nằm trong tương lai.';
      if (transaction.bankAccountId !== undefined) {
        if (!isBankOnlyIncome(transaction) || !parseLocalDate(transaction.date) ||
          !bankAccounts.some((account) => account.id === transaction.bankAccountId) ||
          !Number.isFinite(transaction.amount) || transaction.amount <= 0 || transaction.amount > 1_000_000_000_000_000 ||
          transaction.allocations?.length || transaction.transferToJarId) return 'Tài khoản nhận tiền hoặc khoản thu chưa phân bổ không hợp lệ.';
        return '';
      }
      if (isCurrent(transaction)) {
        if (!activeJarIds.has(transaction.jarId)) return 'Hũ của giao dịch không còn hoạt động.';
        if (transaction.type === 'income' && !allocationsAreValid(transaction, activeJarIds)) {
          return 'Phân bổ khoản thu phải hợp lệ và có tổng bằng số tiền giao dịch.';
        }
        if (transaction.type === 'transfer' && (
          !transaction.transferToJarId ||
          !activeJarIds.has(transaction.transferToJarId) ||
          transaction.transferToJarId === transaction.jarId
        )) return 'Hũ nhận của giao dịch chuyển hũ không hợp lệ.';
        return '';
      }
      if (!isHistorical(transaction) || transaction.type === 'transfer') {
        return 'Chỉ có thể ghi thu hoặc chi cho chu kỳ cũ; chuyển hũ chỉ thuộc chu kỳ hiện tại.';
      }
      const allowedIds = historicalIds(transaction);
      if (transaction.type === 'expense' && !allowedIds.has(transaction.jarId)) {
        return 'Hũ chi tiêu chưa có số dư đầu kỳ trong chu kỳ này. Hãy đối soát số dư trước.';
      }
      if (transaction.type === 'income' && !allocationsAreValid(transaction, allowedIds)) {
        return 'Phân bổ khoản thu phải thuộc các hũ đã có dữ liệu trong chu kỳ này và có tổng bằng số tiền giao dịch.';
      }
      return '';
    };
    const canMutateExisting = (transaction: Transaction) => {
      if (isBankOnlyIncome(transaction)) return bankAccounts.some((account) => account.id === transaction.bankAccountId)
        && (isCurrent(transaction) || isHistorical(transaction));
      if (archivedJars.some((jar) => (
        jar.id === transaction.jarId ||
        jar.id === transaction.transferToJarId ||
        transaction.allocations?.some((allocation) => allocation.jarId === jar.id)
      ))) return false;
      if (isCurrent(transaction)) return true;
      if (!isHistorical(transaction) || transaction.type === 'transfer') return false;
      const allowedIds = historicalIds(transaction);
      return transaction.type === 'expense'
        ? allowedIds.has(transaction.jarId)
        : allocationsAreValid(transaction, allowedIds);
    };

    const transactionIds = new Set(transactions.map((item) => item.id));
    const nextIds = new Set<string>();
    const bankIds = new Set(transactions.map((item) => item.bankTransactionId).filter(Boolean));
    for (const { previous, next } of changes) {
      if (previous && !canMutateExisting(previous)) {
        setDataError('Giao dịch này được khóa vì không có đủ dữ liệu hũ để tính lại số dư an toàn.');
        return false;
      }
      if (next) {
        const validationError = validateNextTransaction(next);
        if (validationError) { setDataError(validationError); return false; }
        if (nextIds.has(next.id) || (!previous && transactionIds.has(next.id))) {
          setDataError('Mã giao dịch bị trùng.'); return false;
        }
        nextIds.add(next.id);
        if (next.bankTransactionId) {
          if (previous?.bankTransactionId) bankIds.delete(previous.bankTransactionId);
          if (bankIds.has(next.bankTransactionId)) {
            setDataError('Sao kê chứa mã bút toán đã được nhập.'); return false;
          }
          bankIds.add(next.bankTransactionId);
        }
      }
    }

    let nextTransactions = transactions;
    for (const { previous, next } of changes) {
      nextTransactions = previous
        ? next
          ? nextTransactions.map((item) => item.id === previous.id ? next : item)
          : nextTransactions.filter((item) => item.id !== previous.id)
        : next ? [next, ...nextTransactions] : nextTransactions;
    }
    let nextSummaries = monthlySummaries;
    const historicalChanges = new Map<string, HistoricalCycleChange>();
    const recordHistoricalChange = (item: Transaction | null, sign: 1 | -1) => {
      if (!item || !isHistorical(item) || isBankOnlyIncome(item)) return;
      const date = parseLocalDate(item.date)!;
      const key = toLocalDateKey(getFinancialCycleStart(date, preferences.monthlyResetDay));
      const entry = historicalChanges.get(key) || { jarIds: new Set<string>(),
        expenseByJarDelta: {} as Record<string, number>, transactionCountDelta: 0 };
      if (item.type === 'expense') entry.jarIds.add(item.jarId);
      item.allocations?.forEach((allocation) => entry.jarIds.add(allocation.jarId));
      entry.transactionCountDelta = (entry.transactionCountDelta || 0) + sign;
      if (item.type === 'expense') {
        entry.expenseByJarDelta![item.jarId] = (entry.expenseByJarDelta![item.jarId] || 0) + sign * item.amount;
      }
      historicalChanges.set(key, entry);
    };
    const historicalIncomeDeltas = new Map<string, { amount: number; allocations: Record<string, number> }>();
    const recordHistoricalIncome = (item: Transaction | null, sign: 1 | -1) => {
      if (!item || item.type !== 'income' || !isHistorical(item) || isBankOnlyIncome(item)) return;
      const date = parseLocalDate(item.date)!;
      const key = toLocalDateKey(getFinancialCycleStart(date, preferences.monthlyResetDay));
      const entry = historicalIncomeDeltas.get(key) || { amount: 0, allocations: {} as Record<string, number> };
      entry.amount += sign * item.amount;
      item.allocations?.forEach((allocation) => {
        entry.allocations[allocation.jarId] = (entry.allocations[allocation.jarId] || 0) + sign * allocation.amount;
      });
      historicalIncomeDeltas.set(key, entry);
    };
    for (const { previous, next } of changes) {
      recordHistoricalChange(previous, -1);
      recordHistoricalChange(next, 1);
      recordHistoricalIncome(previous, -1);
      recordHistoricalIncome(next, 1);
    }
    for (const [key, delta] of historicalIncomeDeltas) {
      const summary = nextSummaries.find((item) => item.cycleStart === key);
      if (!summary || summary.income + delta.amount < 0 ||
        Object.entries(delta.allocations).some(([jarId, amount]) =>
          !summary.jarBreakdown?.some((snapshot) => snapshot.jarId === jarId &&
            snapshot.cycleAllocation + amount >= 0))) {
        setDataError(`Thu nhập hoặc phân bổ trong chu kỳ ${key} cần đối soát trước khi sửa.`);
        return false;
      }
      nextSummaries = adjustCompletedCycleIncome(nextSummaries, key, delta.amount,
        Object.entries(delta.allocations).map(([jarId, amount]) => ({ jarId, amount })));
    }
    const previousCurrentIncomes = changes.map(({ previous }) => previous).filter(
      (item): item is Transaction => Boolean(item?.type === 'income' && isCurrent(item) && item.allocations),
    );
    const nextCurrentIncomes = changes.map(({ next }) => next).filter(
      (item): item is Transaction => Boolean(item?.type === 'income' && isCurrent(item) && item.allocations),
    );
    const nextMonthlyIncome = Math.max(
      0,
      monthlyIncome - previousCurrentIncomes.reduce((sum, item) => sum + item.amount, 0)
        + nextCurrentIncomes.reduce((sum, item) => sum + item.amount, 0),
    );

    let updatedJars = jars;
    try {
      for (const previousCurrentIncome of previousCurrentIncomes) {
        updatedJars = updatedJars.map((jar) => {
          const allocation = previousCurrentIncome.allocations?.find((item) => item.jarId === jar.id);
          return allocation
            ? setJarCycleAllocation(
                jar,
                Math.max(0, (normalizeJarBudgetState(jar).cycleAllocation || 0) - allocation.amount),
              )
            : jar;
        });
      }
      for (const nextCurrentIncome of nextCurrentIncomes) {
        updatedJars = updatedJars.map((jar) => {
          const allocation = nextCurrentIncome.allocations?.find((item) => item.jarId === jar.id);
          return allocation
            ? setJarCycleAllocation(
                jar,
                (normalizeJarBudgetState(jar).cycleAllocation || 0) + allocation.amount,
              )
            : jar;
        });
      }
      updatedJars = applyCurrentCycleSpending(
        updatedJars,
        nextTransactions,
        preferences.monthlyResetDay,
      );
      if (historicalChanges.size) {
        const replayed = replayHistoricalBalances(nextSummaries, nextTransactions, updatedJars,
          preferences.monthlyResetDay, historicalChanges);
        nextSummaries = replayed.summaries;
        updatedJars = replayed.jars;
      }
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Không thể tính lại số dư lịch sử.');
      return false;
    }
    setTransactions(nextTransactions);
    setMonthlySummaries(syncBankIncomeSummaries(nextSummaries, transactions, nextTransactions, preferences.monthlyResetDay));
    setJars(updatedJars);
    setBankAccounts(syncBankAccountsWithJars(updatedJars, bankAccounts, nextTransactions));
    if (previousCurrentIncomes.length || nextCurrentIncomes.length) setMonthlyIncome(nextMonthlyIncome);
    setDataError('');
    return true;
  };

  const commitTransactionChange = (previous: Transaction | null, next: Transaction | null) =>
    commitTransactionChanges([{ previous, next }]);

  const handleAddTransactionBatch = (items: Omit<Transaction, 'id'>[]) =>
    commitTransactionChanges(items.map((item) => ({
      previous: null,
      next: { ...item, id: `tx-${crypto.randomUUID()}` },
    })));

  const handleAddTransaction = (newTxData: Omit<Transaction, 'id'>) => {
    return commitTransactionChange(null, {
      ...newTxData,
      id: `tx-${Date.now()}`,
    });
  };

  const handleUpdateTransaction = (id: string, updatedData: Omit<Transaction, 'id'>) => {
    const previousTransaction = transactions.find((transaction) => transaction.id === id);
    if (!previousTransaction) {
      setDataError('Không tìm thấy giao dịch cần chỉnh sửa.');
      return false;
    }
    return commitTransactionChange(previousTransaction, { ...updatedData, id });
  };

  const handleDeleteTransaction = (id: string) => {
    const transaction = transactions.find((item) => item.id === id);
    if (!transaction) return;
    commitTransactionChange(transaction, null);
  };

  const handleSaveHistoricalOpening = (date: string, jarId: string, amount: number): string | null => {
    try {
      const seeded = addHistoricalOpeningBalance(monthlySummaries, transactions, jars,
        date, jarId, amount, preferences.monthlyResetDay);
      const parsed = parseLocalDate(date)!;
      const key = toLocalDateKey(getFinancialCycleStart(parsed, preferences.monthlyResetDay));
      const replayed = replayHistoricalBalances(seeded, transactions, jars, preferences.monthlyResetDay,
        new Map([[key, { jarIds: new Set([jarId]) }]]));
      setMonthlySummaries(replayed.summaries);
      setJars(replayed.jars);
      setDataError('');
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể đối soát số dư hũ lịch sử.';
      setDataError(message);
      return message;
    }
  };

  const handleAddCryptoAsset = (newAssetData: Omit<CryptoAsset, 'id'>) => {
    const newAsset: CryptoAsset = {
      ...newAssetData,
      id: `crypto-${Date.now()}`,
    };
    setCryptoAssets((prev) => [newAsset, ...prev]);
  };

  const handleUpdateCryptoAsset = (updatedAsset: CryptoAsset) => {
    setCryptoAssets((prev) =>
      prev.map((a) => (a.id === updatedAsset.id ? updatedAsset : a))
    );
  };

  const handleDeleteCryptoAsset = (id: string) => {
    setCryptoAssets((prev) => prev.filter((a) => a.id !== id));
  };

  const handleAddSafetyInvestment = (investment: Omit<SafetyInvestment, 'id'>) => {
    setSafetyInvestments((current) => [
      ...current,
      { ...investment, id: `safe-investment-${Date.now()}` },
    ]);
  };

  const handleUpdateSafetyInvestment = (investment: SafetyInvestment) => {
    setSafetyInvestments((current) =>
      current.map((item) => (item.id === investment.id ? investment : item))
    );
  };

  const handleDeleteSafetyInvestment = (id: string) => {
    setSafetyInvestments((current) => current.filter((item) => item.id !== id));
  };

  const handleSaveBankBalance = async (accountId: string, balance: number) => {
    const ownerId = user.id;
    const account = bankAccounts.find((item) => item.id === accountId);
    if (!account) throw new Error('Không tìm thấy tài khoản đã liên kết');
    const res = await apiFetch('/api/bank/balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bankCode: account.bankCode,
        accountNumber: account.accountNumber,
        balance,
      }),
    });
    const data = await res.json();
    if (currentUserIdRef.current !== ownerId) return;
    if (!res.ok || !data.success) throw new Error(data.error || 'Không thể cập nhật số dư');
    setBankAccounts((prev) =>
      prev.map((item) =>
        item.id === accountId
          ? { ...item, balance: data.newBalance,
              unallocatedOpeningBalance: data.newBalance - getBankOnlyIncomeTotal(transactions, accountId), lastSynced: data.lastSynced }
          : item
      )
    );
  };

  const handleAddBankAccount = (account: Omit<BankAccount, 'id'>) => {
    setBankAccounts((current) => deduplicateBankAccounts([
      ...current,
      { ...account, id: `bank-manual-${Date.now()}`, isManuallyAdded: true, unallocatedOpeningBalance: account.balance },
    ]));
  };

  const handleUpdateBankAccount = async (
    accountId: string,
    details: Pick<BankAccount, 'bankCode' | 'accountNumber' | 'accountHolder'>,
  ) => {
    const result = editBankAccountDetails(jars, bankAccounts, accountId, details, transactions);
    try {
      await queueDataSave(user.id, {
        monthlyIncome,
        jars: result.jars,
        archivedJars,
        activeJarPlanId,
        jarPlanSnapshots,
        transactions,
        bankAccounts: result.bankAccounts,
        cryptoAssets,
        safetyInvestments,
        debtItems,
        isAmountsHidden,
        preferences,
        activeCycleStart,
        monthlySummaries,
        customCategories,
      });
      if (currentUserIdRef.current !== user.id) return;
      setJars(result.jars);
      setBankAccounts(result.bankAccounts);
      setDataError('');
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Không thể lưu tài khoản ngân hàng.');
      throw error;
    }
  };

  const handleDeleteBankAccount = (accountId: string) => {
    if (transactions.some((transaction) => transaction.bankAccountId === accountId)) {
      setDataError('Tài khoản này có giao dịch nhận tiền. Hãy xử lý các giao dịch liên quan trước khi xóa tài khoản.');
      return;
    }
    setBankAccounts((current) => current.filter((account) =>
      account.id !== accountId || !account.isManuallyAdded
    ));
  };

  const handlePreferencesChange = (nextPreferences: AppPreferences) => {
    if (nextPreferences.monthlyResetDay !== preferences.monthlyResetDay) {
      const currentCycleStart = getFinancialCycleStart(
        new Date(),
        nextPreferences.monthlyResetDay,
      );
      const currentCycleEnd = getNextFinancialCycleStart(
        currentCycleStart,
        nextPreferences.monthlyResetDay,
      );
      // Rebase the open cycle to the newly selected boundary. Existing summaries and
      // carryover source lots remain immutable; no money is moved merely by changing a setting.
      setRolloverNotice(null);
      const currentExpenses = getExpenseByJar(
        getCycleTransactions(transactions, currentCycleStart, currentCycleEnd)
      );
      setJars((current) => current.map((jar) => ({
        ...jar,
        currentSpent: currentExpenses[jar.id] || 0,
      })));
      setActiveCycleStart(toLocalDateKey(currentCycleStart));
    }
    setPreferences(nextPreferences);
  };

  const jarRegistry = [...jars, ...archivedJars];
  const appFooter = (
    <footer className="bg-[#09090b] text-zinc-500 py-6 text-center text-xs border-t border-zinc-800/80 mt-12">
      <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
        <p>© 2026 RoFinance. Quản Lý Hũ Tài Chính & Danh Mục Đầu Tư.</p>
        <div className="flex items-center gap-3 text-[11px]">
          <a href="/privacy-policy" className="text-zinc-500 hover:text-indigo-400">Quyền riêng tư</a>
          <a href="/terms-of-service" className="text-zinc-500 hover:text-indigo-400">Điều khoản</a>
        </div>
      </div>
    </footer>
  );

  return (
    <div className={`${isNativeApp ? 'mobile-app-shell' : 'min-h-screen'} bg-[#09090b] text-zinc-100 font-sans antialiased flex flex-col`}>
      <TranslationLayer language={preferences.language} currency={preferences.currency} />
      {dataError && <div className="bg-rose-950 text-rose-200 text-xs text-center p-2">{dataError}</div>}
      {updatePending && <div role="status" className="bg-indigo-100 text-indigo-950 dark:bg-indigo-950 dark:text-indigo-100 text-xs text-center p-2">
        {preferences.language === 'en'
          ? 'An update is available. Finish and close open forms; the app will refresh after saving your changes.'
          : 'Có bản cập nhật. Hoàn tất và đóng biểu mẫu; ứng dụng sẽ làm mới sau khi lưu các thay đổi.'}
      </div>}
      {/* Header Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={selectTab}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        user={user}
        preferences={preferences}
        onPreferencesChange={handlePreferencesChange}
      />

      {/* Main Container */}
      <main ref={mobileContentRef} className={`${isNativeApp ? 'mobile-app-content ' : ''}${isRefreshingData ? 'pointer-events-none ' : ''}mx-auto w-full max-w-7xl flex-1 px-2 pb-20 pt-3 sm:px-6 sm:pb-24 sm:pt-6 lg:px-8`}>
        {dailyRewardNotice && <div data-no-translate="true" role="status" className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-4 text-sm text-indigo-300"><span>{preferences.language === 'en' ? '+20 draw points for logging an expense today!' : '+20 điểm quay thưởng vì đã ghi chi tiêu hôm nay!'}</span><button type="button" onClick={() => setDailyRewardNotice(false)} aria-label={preferences.language === 'en' ? 'Dismiss reward notification' : 'Đóng thông báo điểm thưởng'} className="min-h-11 min-w-11 cursor-pointer rounded-xl p-2"><X size={16}/></button></div>}
        {rolloverNotice && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-emerald-50 shadow-lg shadow-emerald-950/10" role="status">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
              <CalendarCheck2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black">Đã bắt đầu chu kỳ tài chính mới</p>
              <p className="mt-1 text-xs leading-relaxed text-emerald-100/75">
                Chu kỳ {rolloverNotice.cycleStart} – {rolloverNotice.cycleEnd} đã được tổng kết.
                {' '}Đã chuyển tiếp {formatVND(rolloverNotice.carriedForward || 0, isAmountsHidden)} tiền chưa dùng sang các hũ của kỳ mới.
                {' '}Giao dịch cũ vẫn được giữ trong mục Chi Tiêu và Thống Kê.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('analytics')}
                className="mt-2 cursor-pointer text-xs font-bold text-emerald-300 underline decoration-emerald-400/40 underline-offset-4 hover:text-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
              >
                Xem tổng kết chu kỳ
              </button>
            </div>
            <button
              type="button"
              aria-label="Đóng thông báo reset"
              onClick={() => setRolloverNotice(null)}
              className="cursor-pointer rounded-lg p-1.5 text-emerald-200/60 transition-colors hover:bg-emerald-500/15 hover:text-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {planChangeNotice && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-cyan-500/25 bg-cyan-500/10 p-4 text-cyan-100" role="status">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
              <LayoutTemplate className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black">Đã áp dụng {planChangeNotice.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-cyan-100/75">
                Đã lưu trữ {planChangeNotice.archivedCount} hũ và chuyển {formatVND(planChangeNotice.transferredAmount, isAmountsHidden)} tiền chưa chi. Cấu hình trước đó đã được lưu để có thể quay lại bất kỳ lúc nào.
              </p>
            </div>
            <button type="button" aria-label="Đóng thông báo đổi kiểu phân bổ" onClick={() => setPlanChangeNotice(null)} className="cursor-pointer rounded-lg p-1.5 text-cyan-200/60 hover:bg-cyan-500/15 hover:text-cyan-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {/* Budget Alerts Banner */}
        {activeTab !== 'character' && <BudgetAlertsBanner
          jars={jars}
          onOpenAIAdvisor={openAIAdvisor}
          onOpenTransactionModal={(jarId) => {
            setSelectedTransactionJarId(jarId);
            setInitialTransactionDate(undefined);
            setEditingTransaction(null);
            setIsTransactionModalOpen(true);
          }}
          isAmountsHidden={isAmountsHidden}
        />}

        {/* Tab Contents */}
        {activeTab === 'character' && <Suspense fallback={<p className="py-8 text-center text-sm text-zinc-400">{preferences.language === 'en' ? 'Opening character profile…' : 'Đang mở hồ sơ nhân vật…'}</p>}>
          <CharacterProfile controller={characterController} finance={characterFinance} language={preferences.language}
            onBack={() => selectTab('jars')} onAccount={() => setIsAuthModalOpen(true)}/>
        </Suspense>}
        {activeTab === 'jars' && (
          <><CharacterCompanion profile={characterController.profile} finance={characterFinance} language={preferences.language} onOpen={() => selectTab('character')}/>
          <JarManagement
            transactions={transactions}
            jars={jars}
            bankAccounts={bankAccounts}
            monthlyIncome={monthlyIncome}
            onOpenIncomeModal={() => setIsIncomeModalOpen(true)}
            onOpenTransactionModal={(jarId) => {
              setSelectedTransactionJarId(jarId || null);
              setInitialTransactionDate(undefined);
              setEditingTransaction(null);
              setIsTransactionModalOpen(true);
            }}
            onUpdateJar={handleUpdateJar}
            onOpenDebtModal={() => setIsDebtModalOpen(true)}
            isAmountsHidden={isAmountsHidden}
            onToggleHideAmounts={() => setIsAmountsHidden((prev) => !prev)}
            onOpenJarPlanSelector={() => setIsJarPlanModalOpen(true)}
          /></>
        )}

        {activeTab === 'transactions' && (
          <TransactionList
            transactions={transactions}
            jars={[...jars, ...archivedJars]}
            customCategories={customCategories}
            onDeleteTransaction={handleDeleteTransaction}
            onEditTransaction={(transaction) => {
              setSelectedTransactionJarId(transaction.jarId);
              setInitialTransactionDate(transaction.date);
              setEditingTransaction(transaction);
              setIsTransactionModalOpen(true);
            }}
            onOpenTransactionModal={(date) => {
              setSelectedTransactionJarId(null);
              setInitialTransactionDate(date);
              setEditingTransaction(null);
              setIsTransactionModalOpen(true);
            }}
            onOpenStatementImport={() => setTransactionImportMode('statement')}
            onOpenBulkEntry={() => setTransactionImportMode('bulk')}
            onOpenHistoricalBalance={(date) => setHistoricalBalanceDate(date)}
            onOpenBankAccountsModal={() => setIsBankAccountsModalOpen(true)}
            isAmountsHidden={isAmountsHidden}
            bankAccounts={bankAccounts}
            onUpdateBankBalance={handleSaveBankBalance}
            monthlySummaries={monthlySummaries}
            resetDay={preferences.monthlyResetDay}
            activeJarIds={jars.map((jar) => jar.id)}
          />
        )}

        {activeTab === 'crypto' && (
          <Suspense fallback={<p className="py-8 text-center text-sm text-zinc-400">Đang tải đầu tư...</p>}>
          <InvestmentDashboard
            cryptoAssets={cryptoAssets}
            onAddCryptoAsset={handleAddCryptoAsset}
            onUpdateCryptoAsset={handleUpdateCryptoAsset}
            onDeleteCryptoAsset={handleDeleteCryptoAsset}
            safetyInvestments={safetyInvestments}
            onAddSafetyInvestment={handleAddSafetyInvestment}
            onUpdateSafetyInvestment={handleUpdateSafetyInvestment}
            onDeleteSafetyInvestment={handleDeleteSafetyInvestment}
            isAmountsHidden={isAmountsHidden}
            onToggleHideAmounts={() => setIsAmountsHidden((prev) => !prev)}
            jars={jars}
          />
          </Suspense>
        )}

        {activeTab === 'analytics' && (
          <Suspense fallback={<p className="py-8 text-center text-sm text-zinc-400">Đang tải thống kê...</p>}>
          {user && <div className="character-feature mb-4 flex justify-end" data-no-translate="true">
            <button type="button" className="character-button" aria-controls="character-leaderboard-title" onClick={() => {
              const heading = document.getElementById('character-leaderboard-title');
              heading?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
              heading?.focus({ preventScroll: true });
            }}>{preferences.language === 'en' ? 'View character leaderboard' : 'Xem bảng xếp hạng nhân vật'}</button>
          </div>}
          <AnalyticsCharts
            jars={jars}
            jarRegistry={jarRegistry}
            transactions={transactions}
            monthlyIncome={monthlyIncome}
            isAmountsHidden={isAmountsHidden}
            monthlySummaries={monthlySummaries}
            resetDay={preferences.monthlyResetDay}
            onExportExcel={supportsReportExport ? (cycle) => exportToExcel(jars, cycle.transactions, cycle.income, jarRegistry, cycle) : undefined}
            onExportPDF={supportsReportExport ? (cycle) => exportToPDFPrint(jars, cycle.transactions, cycle.income, jarRegistry, cycle) : undefined}
            onUpdateSummaryIncome={(summaryId, income) => setMonthlySummaries((current) =>
              current.map((summary) => summary.id === summaryId
                ? { ...summary, income }
                : summary)
            )}
          />
          {user && <CharacterLeaderboard language={preferences.language} optIn={characterController.profile?.optIn ?? null} ownerId={user.id}
            refreshKey={characterRefreshKey} onOpenProfile={() => selectTab('character')}/>}
          </Suspense>
        )}
        {isNativeApp && appFooter}
      </main>

      {isNativeApp && <MobileEdgeRefresh
        scrollRef={mobileContentRef}
        language={preferences.language}
        onRefresh={refreshAccountData}
      />}

      {!isAIAdvisorOpen && <button
        ref={aiLauncherRef}
        type="button"
        onClick={openAIAdvisor}
        aria-label={preferences.language === 'en' ? 'Open AI financial assistant' : 'Mở trợ lý tài chính AI'}
        aria-controls="ai-advisor-popup"
        aria-expanded={false}
        className={`${isNativeApp ? 'mobile-ai-launcher ' : ''}fixed bottom-4 right-4 z-40 inline-flex h-12 cursor-pointer items-center gap-2 rounded-full border border-indigo-400/40 bg-indigo-600 px-4 text-xs font-black text-white shadow-xl shadow-indigo-950/40 transition-colors hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] sm:bottom-6 sm:right-6`}
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        <span>{preferences.language === 'en' ? 'AI assistant' : 'Trợ lý AI'}</span>
      </button>}

      {/* Modals & Slide-overs */}
      <IncomeAllocatorModal
        isOpen={isIncomeModalOpen}
        onClose={() => setIsIncomeModalOpen(false)}
        jars={jars}
        currentIncome={monthlyIncome}
        isAmountsHidden={isAmountsHidden}
        onApplyAllocation={handleApplyAllocation}
        onOpenDebtModal={() => {
          setIsIncomeModalOpen(false);
          setIsDebtModalOpen(true);
        }}
      />

      <JarPlanSelectorModal
        isOpen={isJarPlanModalOpen}
        onClose={() => setIsJarPlanModalOpen(false)}
        activePlanId={activeJarPlanId}
        currentJars={jars}
        snapshots={jarPlanSnapshots}
        hasActiveDebt={debtItems.some((debt) => debt.status === 'active' && debt.remainingAmount > 0)}
        onApply={handleSwitchJarPlan}
        language={preferences.language}
        onOpenCommunity={() => { setIsJarPlanModalOpen(false); setIsCommunityModalOpen(true); }}
      />
      {user && isCommunityModalOpen && <CommunityPlansModal key={user.id} ownerId={user.id} jars={jars} language={preferences.language}
        onClose={() => setIsCommunityModalOpen(false)} onAdopt={handleCommunityAdopt} onRefresh={refreshAccountData}/>}

      <DebtManagementModal
        isOpen={isDebtModalOpen}
        onClose={() => setIsDebtModalOpen(false)}
        debtItems={debtItems}
        jars={jars}
        monthlyIncome={monthlyIncome}
        onUpdateDebts={(newDebts) => setDebtItems(newDebts)}
        onApplyNewJarAllocations={(updatedJars) => {
          setActiveJarPlanId(CUSTOM_JAR_PLAN_ID);
          setJars((current) => applyCurrentCycleSpending(
            mergeJarCycleAllocationUpdates(current, updatedJars),
            transactions,
            preferences.monthlyResetDay,
          ));
        }}
        isAmountsHidden={isAmountsHidden}
      />

      <TransactionModal
        isOpen={isTransactionModalOpen}
        bankAccounts={bankAccounts}
        isAmountsHidden={isAmountsHidden}
        onClose={() => {
          setIsTransactionModalOpen(false);
          setEditingTransaction(null);
          setInitialTransactionDate(undefined);
        }}
        jars={jars}
        onAddTransaction={handleAddTransaction}
        onUpdateTransaction={handleUpdateTransaction}
        customCategories={customCategories}
        onAddCategory={(newCategory) => setCustomCategories((current) => [...current, newCategory])}
        onUpdateCategory={(updatedCategory) => setCustomCategories((current) => (
          current.map((category) => category.id === updatedCategory.id ? updatedCategory : category)
        ))}
        initialJarId={selectedTransactionJarId}
        initialDate={initialTransactionDate}
        resetDay={preferences.monthlyResetDay}
        editingTransaction={editingTransaction}
        monthlySummaries={monthlySummaries}
      />

      <TransactionImportModal
        mode={transactionImportMode}
        onClose={() => setTransactionImportMode(null)}
        onSave={handleAddTransactionBatch}
        transactions={transactions}
        jars={jars}
        bankAccounts={bankAccounts}
        categories={customCategories}
        monthlySummaries={monthlySummaries}
        resetDay={preferences.monthlyResetDay}
        isAmountsHidden={isAmountsHidden}
      />

      <HistoricalBalanceModal
        isOpen={historicalBalanceDate !== null}
        onClose={() => setHistoricalBalanceDate(null)}
        onSave={handleSaveHistoricalOpening}
        jars={jars}
        summaries={monthlySummaries}
        resetDay={preferences.monthlyResetDay}
        initialDate={historicalBalanceDate || undefined}
        isAmountsHidden={isAmountsHidden}
      />

      <BankAccountsModal
        isOpen={isBankAccountsModalOpen}
        onClose={() => setIsBankAccountsModalOpen(false)}
        bankAccounts={bankAccounts}
        jars={jars}
        transactions={transactions}
        onSaveBalance={handleSaveBankBalance}
        onAddBankAccount={handleAddBankAccount}
        onUpdateBankAccount={handleUpdateBankAccount}
        onDeleteBankAccount={handleDeleteBankAccount}
        isAmountsHidden={isAmountsHidden}
      />

      {isAIAdvisorOpen && <Suspense fallback={null}><AIAdvisorDrawer
        isOpen={isAIAdvisorOpen}
        onClose={closeAIAdvisor}
        jars={jars}
        monthlyIncome={monthlyIncome}
        transactions={transactions}
        isAmountsHidden={isAmountsHidden}
      /></Suspense>}

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        user={user}
        onAuthChanged={handleAuthChanged}
        onLogoutWarning={setLogoutWarning}
      />

      {!isNativeApp && appFooter}
    </div>
  );
}
