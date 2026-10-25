import React, { useEffect, useState } from 'react';
import { X, Calculator, ArrowRight, CheckCircle2, Building2, Percent, Wallet, CreditCard } from 'lucide-react';
import { BankAccount, Jar, Transaction } from '../types';
import { formatVND } from '../utils/formatters';
import { getDisplayCurrencyCode, getRuntimePreferences } from '../lib/preferences';
import { CurrencyInput } from './CurrencyInput';
import { getCarryoverTotal, getTransferredInTotal, toLocalDateKey } from '../utils/monthlyCycle';
import { allocateWholeUnits } from '../utils/jarPlans';
import type { SalaryReceiptInput } from '../utils/salaryAllocation';
import { bankAccountKey } from '../utils/bankAccounts';

const EN_SALARY_ERRORS: Record<string, string> = {
  'Số tiền hoặc ngày nhận lương trong chu kỳ hiện tại không hợp lệ.': 'Enter a valid salary amount and a date in the current cycle, not in the future.',
  'Tổng tỷ lệ phân bổ phải bằng 100%.': 'Allocation percentages must total 100%.',
  'Vui lòng chọn tài khoản nhận lương đã lưu.': 'Select a saved salary receiving account.',
  'Mã giao dịch phân bổ bị trùng. Vui lòng tải lại dữ liệu.': 'An allocation transaction ID conflicts with existing data. Reload before retrying.',
  'Không đủ số dư để điều chỉnh phân bổ lương đã ghi nhận. Vui lòng đối soát tài khoản trước.': 'Insufficient balance to correct this salary allocation. Reconcile the accounts first.',
  'Lương đã liên kết hũ lưu trữ. Giữ nguyên số tiền, ngày và tài khoản nhận để phân bổ lại mà không ghi đè lịch sử.': 'This salary references archived jars. Keep its amount, date and receiving account unchanged when redistributing it to preserve history.',
  'Giao dịch phân bổ lương không hợp lệ': 'Invalid salary allocation transaction.',
  'Chuyển khoản nội bộ phải dùng hai tài khoản đã lưu khác nhau': 'Internal transfers require two different saved accounts.',
  'Lương chỉ được ghi nhận một lần và tổng chuyển nội bộ không được vượt lương': 'Record salary only once; total internal transfers cannot exceed it.',
  'Tài khoản nhận phần chưa liên kết không hợp lệ.': 'The account for unlinked jars is invalid.',
  'Hũ chưa liên kết ngân hàng. Vui lòng chọn tài khoản nhận phần này.': 'Select a receiving account for jars without a linked bank account.',
  'Lương đã liên kết hũ lưu trữ. Không thể đổi cách nhận hoặc ghi đè phân bổ lịch sử.': 'This salary references archived jars. Its receiving mode and historical allocations cannot be overwritten.',
  'Nguồn nhận lương không hợp lệ': 'Invalid salary source.',
  'Lương từ tài khoản chưa khai báo phải ghi thu trực tiếp, không kèm chuyển khoản nội bộ hoặc phân bổ trùng': 'Salary from an untracked account requires direct receipts, without internal transfers or duplicate allocations.',
};

interface IncomeAllocatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  jars: Jar[];
  currentIncome: number;
  bankAccounts: BankAccount[];
  salaryReceipt?: Transaction;
  externalFallbackAccountId?: string;
  additionalIncomeAllocations?: { jarId: string; amount: number }[];
  cycleStart: string;
  onApplyAllocation: (newIncome: number, updatedJars: Jar[], receipt?: SalaryReceiptInput) => void | Promise<void>;
  onOpenDebtModal?: () => void;
  isAmountsHidden?: boolean;
}

export const IncomeAllocatorModal: React.FC<IncomeAllocatorModalProps> = ({
  isOpen,
  onClose,
  jars,
  currentIncome,
  bankAccounts,
  salaryReceipt,
  externalFallbackAccountId,
  additionalIncomeAllocations = [],
  cycleStart,
  onApplyAllocation,
  onOpenDebtModal,
  isAmountsHidden = false,
}) => {
  const [incomeInput, setIncomeInput] = useState<number>(currentIncome);
  const [tempJars, setTempJars] = useState<Jar[]>(jars);
  const [recordSalary, setRecordSalary] = useState(true);
  const [salaryAccountId, setSalaryAccountId] = useState('');
  const [unlinkedAccountId, setUnlinkedAccountId] = useState('');
  const [salaryDate, setSalaryDate] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isEnglish = getRuntimePreferences().language === 'en';

  useEffect(() => {
    if (!isOpen) return;
    setIncomeInput(salaryReceipt?.amount ?? currentIncome);
    setTempJars(jars.map((jar) => ({ ...jar })));
    setRecordSalary(bankAccounts.length > 0);
    setSalaryAccountId(salaryReceipt?.salarySource === 'external' ? '' : salaryReceipt?.bankAccountId || bankAccounts[0]?.id || '');
    setUnlinkedAccountId(externalFallbackAccountId || '');
    setSalaryDate(salaryReceipt?.date || toLocalDateKey(new Date()));
    setError('');
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePercentageChange = (jarId: string, newPercent: number) => {
    setTempJars((prev) =>
      prev.map((j) => (j.id === jarId ? { ...j, percentage: newPercent } : j))
    );
  };

  const totalPercentage = tempJars.reduce((sum, j) => sum + (j.percentage || 0), 0);
  const amounts = allocateWholeUnits(incomeInput, tempJars.map(j => j.percentage));
  const receivingAccounts = new Map<string, number>();
  let needsUnlinkedAccount = false;
  tempJars.forEach((jar, index) => {
    const linked = bankAccounts.find(a => bankAccountKey(a) === bankAccountKey(jar));
    if (!linked && amounts[index] > 0) needsUnlinkedAccount = true;
    const destination = linked?.id || salaryAccountId || unlinkedAccountId;
    receivingAccounts.set(destination, (receivingAccounts.get(destination) || 0) + amounts[index]);
  });

  const handleSave = async () => {
    if (saving) return;
    setError('');
    if (!Number.isSafeInteger(incomeInput) || incomeInput < (recordSalary ? 1 : 0) || incomeInput > 1_000_000_000_000_000 ||
      tempJars.some(j => !Number.isFinite(j.percentage) || j.percentage < 0 || j.percentage > 100) ||
      Math.abs(totalPercentage - 100) > 0.000001) {
      setError(isEnglish ? 'Enter a valid amount and allocations totalling 100%.' : 'Nhập số tiền hợp lệ và tổng tỷ lệ bằng 100%.');
      return;
    }
    // Calculate new target budgets
    const updated = tempJars.map((j, index) => ({
      ...j,
      cycleAllocation: amounts[index],
      targetBudget: getCarryoverTotal(j) + getTransferredInTotal(j) + amounts[index],
    }));
    setSaving(true);
    try {
      await onApplyAllocation(incomeInput, updated, recordSalary ? { bankAccountId: salaryAccountId || null, date: salaryDate,
        ...(!salaryAccountId && needsUnlinkedAccount && unlinkedAccountId ? { unlinkedBankAccountId: unlinkedAccountId } : {}),
      } : undefined);
      onClose();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      setError((isEnglish ? EN_SALARY_ERRORS[message] : undefined) || message || (isEnglish ? 'Could not save allocation.' : 'Không thể lưu phân bổ.'));
    } finally { setSaving(false); }
  };

  const handleQuickPreset = (amount: number) => {
    setIncomeInput(amount);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div role="dialog" aria-modal="true" aria-labelledby="income-allocation-title" className="bg-[#18181b] rounded-[32px] shadow-2xl max-w-3xl w-full overflow-hidden border border-zinc-800 my-8 text-zinc-100">
        {/* Header */}
        <div className="bg-[#121214] text-white p-6 relative border-b border-zinc-800">
          <button
            onClick={onClose}
            disabled={saving}
            className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1.5 rounded-xl hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 text-indigo-400">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <h2 id="income-allocation-title" className="text-xl font-black text-white tracking-tight">Phân Bổ Hũ Tài Chính Hàng Tháng</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                {isEnglish ? 'Saved salary account: receive salary, then transfer internally. Untracked source: receive directly into allocated accounts. Jars remain spending limits; no bank payment is initiated.' : 'Nguồn lương đã lưu: ghi thu rồi chuyển nội bộ. Nguồn chưa khai báo: ghi thu trực tiếp vào các tài khoản được phân bổ. Hũ vẫn là hạn mức; ứng dụng không chuyển tiền thật tại ngân hàng.'}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          <div className="space-y-3 rounded-2xl border border-zinc-700 bg-[#121214] p-4" data-no-translate="true">
            <label htmlFor="salary-entry-mode" className="block text-xs font-bold text-zinc-300">{isEnglish ? 'Action' : 'Thao tác'}</label>
            <select id="salary-entry-mode" value={recordSalary ? 'salary' : 'budget'} onChange={e => { const salary = e.target.value === 'salary'; setRecordSalary(salary); setIncomeInput(salary ? salaryReceipt?.amount ?? currentIncome : jars.reduce((sum, j) => sum + (j.cycleAllocation ?? j.targetBudget - getCarryoverTotal(j) - getTransferredInTotal(j)), 0)); }} disabled={saving} className="w-full rounded-xl border border-zinc-700 bg-[#1c1c20] p-3 text-sm text-white">
              <option value="salary" disabled={!bankAccounts.length}>{isEnglish ? 'Record salary and distribute to accounts' : 'Ghi nhận lương và phân bổ vào tài khoản'}</option>
              <option value="budget">{isEnglish ? 'Adjust budget limits only (no bank transaction)' : 'Chỉ điều chỉnh hạn mức (không ghi thu vào ngân hàng)'}</option>
            </select>
            {recordSalary && <>
              <label htmlFor="salary-bank-account" className="block text-xs font-bold text-zinc-300">{isEnglish ? 'Salary receiving account' : 'Tài khoản nhận lương'}</label>
              <select id="salary-bank-account" value={salaryAccountId} onChange={e => setSalaryAccountId(e.target.value)} disabled={saving} className="w-full rounded-xl border border-zinc-700 bg-[#1c1c20] p-3 text-sm text-white">
                <option value="">{isEnglish ? 'Untracked salary account · receive directly into allocated accounts' : 'Tài khoản lương chưa khai báo · nhận trực tiếp vào tài khoản phân bổ'}</option>
                {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.bankName} · {a.accountNumber}</option>)}
              </select>
              {!salaryAccountId && <p className="text-xs text-zinc-400">{isEnglish ? 'Each allocated account receives income directly. No source account is created or debited, and no internal transfer is recorded.' : 'Mỗi tài khoản được phân bổ nhận thu trực tiếp. Không tạo hoặc trừ tiền tài khoản nguồn, không ghi chuyển khoản nội bộ.'}</p>}
              {!salaryAccountId && needsUnlinkedAccount && <>
                <label htmlFor="salary-unlinked-account" className="block text-xs font-bold text-zinc-300">{isEnglish ? 'Receiving account for unlinked jars' : 'Tài khoản nhận tiền của hũ chưa liên kết'}</label>
                <select id="salary-unlinked-account" value={unlinkedAccountId} onChange={e => setUnlinkedAccountId(e.target.value)} disabled={saving} className="w-full rounded-xl border border-zinc-700 bg-[#1c1c20] p-3 text-sm text-white">
                  <option value="">{isEnglish ? 'Select a saved account' : 'Chọn tài khoản đã lưu'}</option>
                  {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.bankName} · {a.accountNumber}</option>)}
                </select>
              </>}
              <label htmlFor="salary-received-date" className="block text-xs font-bold text-zinc-300">{isEnglish ? 'Salary received date' : 'Ngày nhận lương'}</label>
              <input id="salary-received-date" type="date" min={cycleStart} max={toLocalDateKey(new Date())} value={salaryDate} onChange={e => setSalaryDate(e.target.value)} disabled={saving} className="w-full rounded-xl border border-zinc-700 bg-[#1c1c20] p-3 text-base text-white" />
              {salaryReceipt && <p className="text-xs text-amber-300">{isEnglish ? 'This cycle already has a salary receipt. Saving replaces that receipt and its transfers; it does not add salary again.' : 'Chu kỳ này đã ghi nhận lương. Lưu lại sẽ điều chỉnh giao dịch và chuyển khoản của lần đó, không cộng lương thêm lần nữa.'}</p>}
              <div className="space-y-1 text-xs text-zinc-300">
                <p>{salaryAccountId
                  ? (isEnglish ? 'Account increases after allocation (shared jars are combined; unlinked jars stay in the salary account):' : 'Tiền tăng thêm ở từng tài khoản (hũ dùng chung được cộng gộp; hũ chưa liên kết giữ tiền ở tài khoản nhận lương):')
                  : (isEnglish ? 'Direct receipts by allocated account (shared jars are combined):' : 'Thu trực tiếp theo tài khoản phân bổ (cộng gộp các hũ dùng chung):')}</p>
                {[...receivingAccounts].filter(([, amount]) => amount > 0).map(([id, amount]) => {
                  const account = bankAccounts.find(a => a.id === id);
                  return <div key={id} className="flex justify-between gap-2"><span>{account ? `${account.bankName} · ${account.accountNumber}` : (isEnglish ? 'Receiving account not selected' : 'Chưa chọn tài khoản nhận')}</span><span className="font-mono">+{formatVND(amount, isAmountsHidden)}</span></div>;
                })}
              </div>
            </>}
            {!bankAccounts.length && <p className="text-xs text-amber-300">{isEnglish ? 'Add a saved bank account to record salary. Budget-only allocation is still available.' : 'Thêm tài khoản ngân hàng đã lưu để ghi nhận lương. Bạn vẫn có thể chỉ cập nhật hạn mức.'}</p>}
          </div>
          {/* Income Input Section */}
          <div className="bg-[#121214] p-5 rounded-2xl border border-zinc-800 space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-300">
              Nhập tổng thu nhập / lương hàng tháng ({getDisplayCurrencyCode()})
            </label>
            <div className="relative">
              <CurrencyInput
                id="salary-income-amount"
                value={incomeInput || ''}
                onValueChange={(value) => setIncomeInput(value === '' ? 0 : value)}
                placeholder={isAmountsHidden ? '••••••••' : '20.000.000'}
                hideAmount={isAmountsHidden}
                className="w-full pl-4 pr-16 py-3.5 text-2xl font-black font-mono text-white bg-[#1c1c20] border border-zinc-700 rounded-2xl focus:border-indigo-500 focus:outline-none transition-all"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-black text-zinc-400">
                {getDisplayCurrencyCode()}
              </span>
            </div>

            {/* Quick Amounts */}
            {!isAmountsHidden && <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-zinc-400 font-medium">Gợi ý nhanh:</span>
              {[15000000, 20000000, 30000000, 50000000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleQuickPreset(amt)}
                  className={`px-3 py-1.5 text-xs font-bold font-mono rounded-xl border transition-all ${
                    incomeInput === amt
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20'
                      : 'bg-[#1c1c20] text-zinc-300 border-zinc-700 hover:bg-zinc-800'
                  }`}
                >
                  {formatVND(amt, isAmountsHidden)}
                </button>
              ))}
            </div>}
          </div>

          {/* Allocation Table */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center space-x-2">
                <Percent className="w-4 h-4 text-indigo-400" />
                <span>Tỷ lệ phân bổ theo {tempJars.length} Hũ Tài Chính & Ngân Hàng</span>
              </h3>
              <div className="flex items-center space-x-2">
                {onOpenDebtModal && (
                  <button
                    type="button"
                    onClick={onOpenDebtModal}
                    className="text-xs font-bold px-3 py-1 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 transition-all flex items-center space-x-1"
                  >
                    <CreditCard className="w-3.5 h-3.5 text-rose-400" />
                    <span>Tự tính % Hũ DEBT</span>
                  </button>
                )}
                <div
                  className={`text-xs font-bold px-3 py-1 rounded-full border ${
                    Math.abs(totalPercentage - 100) < 0.01
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  }`}
                >
                  Tổng tỷ lệ: {totalPercentage.toFixed(2)}% {Math.abs(totalPercentage - 100) < 0.01 ? '✓ chuẩn' : '⚠️'}
                </div>
              </div>
            </div>

            <div className="border border-zinc-800 rounded-2xl overflow-x-auto bg-[#121214]">
              <table className="w-full min-w-[760px] text-left border-collapse">
                <thead>
                  <tr className="bg-[#1c1c20] text-zinc-400 text-[11px] font-bold uppercase tracking-wider border-b border-zinc-800">
                    <th className="p-3.5">Ngân Hàng</th>
                    <th className="p-3.5">Hũ Tài Chính</th>
                    <th className="p-3.5 text-center w-28">Tỷ Lệ (%)</th>
                    <th className="p-3.5 text-right">Phân bổ kỳ mới</th>
                    <th className="p-3.5 text-right">Tổng khả dụng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80 text-xs">
                  {tempJars.map((jar, index) => {
                    const allocatedAmount = amounts[index];
                    const carryoverAmount = getCarryoverTotal(jar);
                    const transferredAmount = getTransferredInTotal(jar);
                    const otherIncome = recordSalary ? additionalIncomeAllocations.filter(a => a.jarId === jar.id).reduce((sum, a) => sum + a.amount, 0) : 0;
                    const existingAmount = carryoverAmount + transferredAmount + otherIncome;
                    return (
                      <tr key={jar.id} className="hover:bg-[#1c1c20] transition-colors">
                        <td className="p-3.5 font-semibold text-zinc-200">
                          <div className="flex items-center space-x-2">
                            <Building2 className="w-4 h-4 text-indigo-400" />
                            <span>{jar.bankName}</span>
                          </div>
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center space-x-2">
                            <span
                              className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                              style={{ backgroundColor: jar.color }}
                            />
                            <div>
                              <div className="font-bold text-white">
                                {jar.name} <span className="text-xs font-normal text-zinc-400">({jar.code})</span>
                              </div>
                              <div className="text-[11px] text-zinc-400 line-clamp-1">{jar.description}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="inline-flex items-center space-x-1">
                            <input
                              type="number"
                              step="0.05"
                              value={jar.percentage}
                              onChange={(e) => handlePercentageChange(jar.id, parseFloat(e.target.value) || 0)}
                              className="w-20 text-center font-bold text-white bg-[#1c1c20] border border-zinc-700 rounded-xl py-1 text-xs focus:outline-none focus:border-indigo-500"
                            />
                            <span className="text-xs font-bold text-zinc-400">%</span>
                          </div>
                        </td>
                        <td className="p-3.5 text-right font-black font-mono text-indigo-300">
                          {formatVND(allocatedAmount, isAmountsHidden)}
                        </td>
                        <td className="p-3.5 text-right font-mono">
                          <div className="font-black text-emerald-300">{formatVND(allocatedAmount + existingAmount, isAmountsHidden)}</div>
                          {existingAmount > 0 && (
                            <div data-no-translate="true" className="mt-0.5 text-[10px] text-zinc-500">
                              {isEnglish ? 'includes carryover/transfers and other receipts' : 'gồm dư/chuyển và khoản thu khác'} {formatVND(existingAmount, isAmountsHidden)}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        {error && <p role="alert" data-no-translate="true" className="px-5 py-3 text-sm text-rose-400">{error}</p>}
        <div className="bg-[#121214] p-5 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-2xl border border-zinc-700 text-zinc-300 font-bold text-xs hover:bg-zinc-800 transition-colors"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 sm:flex-none px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center space-x-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Áp Dụng Phân Bổ</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
