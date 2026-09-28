import type { CategoryIconKey } from '../shared/category';

export type BankCode = string;

export interface JarCarryover {
  sourceCycleStart: string;
  sourceCycleEnd: string;
  amount: number;
  sourceJarId?: string;
  sourceJarCode?: string;
  sourceJarName?: string;
}

export interface TransactionCategory {
  id: string;
  name: string;
  type: 'expense' | 'income';
  icon: CategoryIconKey;
  jarCode?: string;
  isCustom?: boolean;
  createdAt?: string;
}

export interface Jar {
  id: string;
  code: 'NEC' | 'SAFE' | 'FFA' | 'PLAY' | 'GIVE' | 'EDU' | 'DEBT' | string;
  name: string;
  percentage: number; // e.g. 40, 9.30, 9.45, 5, 10, 26.25
  bankName: string;
  bankCode: BankCode;
  accountNumber: string;
  accountName: string;
  color: string;
  description: string;
  targetBudget: number; // Calculated based on income or user override
  currentSpent: number;
  cycleAllocation?: number;
  carryovers?: JarCarryover[];
  transferredIn?: JarCarryover[];
  lastRolloverCycleStart?: string;
}

export interface JarPlanSnapshot {
  id: string;
  name: string;
  sourcePlanId: string;
  jars: Jar[];
  createdAt: string;
}

export interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  jarId: string;
  category: string;
  categoryId?: string;
  categoryIcon?: CategoryIconKey;
  date: string; // ISO format or YYYY-MM-DD
  description: string;
  paymentMethodCode?: string;
  legacyPaymentLabel?: string;
  bankName?: string;
  recipientAccount?: string;
  recipientBank?: string;
  sourceAccountNumber?: string;
  counterpartyName?: string;
  transferToJarId?: string;
  sourceBankCode?: string;
  destinationBankCode?: string;
  bankTransactionId?: string;
  allocations?: { jarId: string; amount: number }[];
}

export interface BankAccount {
  id: string;
  bankName: string;
  bankCode: BankCode;
  accountNumber: string;
  accountHolder: string;
  balance: number;
  lastSynced: string;
  status: 'connected' | 'disconnected' | 'syncing';
  logoUrl?: string;
  linkedJarCode?: string;
  bin?: string;
  isManuallyAdded?: boolean;
}

export interface MonthlyIncomeRecord {
  id: string;
  monthYear: string; // e.g. "2026-07"
  incomeAmount: number;
  allocations: {
    jarId: string;
    allocatedAmount: number;
    percentage: number;
    isTransferred: boolean;
  }[];
  createdAt: string;
}

export interface MonthlyCycleSummary {
  id: string;
  cycleStart: string;
  cycleEnd: string;
  income: number;
  expense: number;
  transactionCount: number;
  spendingByJar: { jarId: string; amount: number }[];
  jarBreakdown?: {
    jarId: string;
    jarCode: string;
    jarName: string;
    openingCarryover: number;
    openingCarryovers?: JarCarryover[];
    transferredIn?: JarCarryover[];
    transferredInAmount?: number;
    cycleAllocation: number;
    availableBudget: number;
    spent: number;
    remaining: number;
    closingCarryovers: JarCarryover[];
    isArchived?: boolean;
  }[];
  carriedForward?: number;
  createdAt: string;
}

export interface AlertNotification {
  id: string;
  jarId: string;
  jarName: string;
  level: 'warning' | 'danger'; // warning: >=80%, danger: >=100%
  spentPercentage: number;
  message: string;
  date: string;
}

export interface CryptoAsset {
  id: string;
  symbol: string; // e.g. 'BTC', 'ETH', 'SOL', 'BNB'
  name: string; // e.g. 'Bitcoin', 'Ethereum'
  amountHeld: number; // e.g. 0.15
  buyPriceUSD: number; // Entry price in USD
  buyDate?: string;
  notes?: string;
  linkedJarCode?: string; // e.g. 'FFA'
  exchange?: 'Binance' | 'OKX' | 'Bybit';
  marketPair?: string;
}

export interface SafetyInvestment {
  id: string;
  providerType: 'tikop' | 'bank' | 'other';
  providerName: string;
  productName: string;
  principalAmount: number;
  annualInterestRate: number;
  startDate: string;
  maturityDate: string;
  notes?: string;
  withdrawals?: SafetyInvestmentWithdrawal[];
}

export interface SafetyInvestmentWithdrawal {
  id: string;
  amount: number;
  date: string;
  notes?: string;
  createdAt: string;
}

export interface BinanceTicker {
  symbol: string; // e.g. 'BTCUSDT'
  lastPrice: string; // '64200.50'
  priceChange: string;
  priceChangePercent: string; // '2.45'
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
}

export interface DebtItem {
  id: string;
  name: string; // e.g. "Vay mua xe", "Trả góp điện thoại"
  totalAmount: number; // e.g. 60,000,000
  remainingAmount: number; // e.g. 30,000,000
  startMonth: string; // ISO date ("2026-01-15"); legacy "YYYY-MM" remains supported
  endMonth: string; // ISO date ("2026-12-15"); legacy "YYYY-MM" remains supported
  monthlyPayment: number; // e.g. 5,000,000
  conversionFee?: number; // installment conversion fee charged by the bank
  conversionFeeMode?: 'upfront' | 'distributed'; // one-time or spread across installments
  calculationMode?: 'total' | 'calculated';
  principalAmount?: number; // amount converted to installments before interest and fees
  interestRate?: number;
  interestRatePeriod?: 'annual' | 'monthly';
  interestAmount?: number;
  conversionFeePercent?: number;
  status: 'active' | 'paid';
  notes?: string;
  reallocateTargetCode?: 'FFA' | 'PROPORTIONAL' | string;
}
