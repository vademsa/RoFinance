import React, { useEffect, useState } from 'react';
import { Landmark, Plus, Save, Trash2, X } from 'lucide-react';
import { BankAccount, Jar } from '../types';
import { BANK_OPTIONS } from '../constants/defaultData';
import { CurrencyInput } from './CurrencyInput';
import { getDerivedBankBalance, getJarsLinkedToBankAccount } from '../utils/bankAccounts';
import { formatVND } from '../utils/formatters';

interface BankAccountsModalProps {
  isOpen: boolean;
  onClose: () => void;
  bankAccounts: BankAccount[];
  jars: Jar[];
  onSaveBalance: (accountId: string, balance: number) => Promise<void>;
  onAddBankAccount: (account: Omit<BankAccount, 'id'>) => void;
  onDeleteBankAccount: (accountId: string) => void;
  isAmountsHidden?: boolean;
}

export const BankAccountsModal: React.FC<BankAccountsModalProps> = ({
  isOpen,
  onClose,
  bankAccounts,
  jars,
  onSaveBalance,
  onAddBankAccount,
  onDeleteBankAccount,
  isAmountsHidden = false,
}) => {
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [selectedBankCode, setSelectedBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [openingBalance, setOpeningBalance] = useState<number | ''>('');
  const [balanceInputs, setBalanceInputs] = useState<Record<string, number | ''>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setBalanceInputs(Object.fromEntries(bankAccounts.map((account) => [account.id, account.balance])));
    setMessage('');
  }, [bankAccounts, isOpen]);

  if (!isOpen) return null;

  const selectedBank = BANK_OPTIONS.find((bank) => bank.code === selectedBankCode);
  const canAdd = Boolean(selectedBank && /^\d{6,19}$/.test(accountNumber) && accountHolder.trim());

  const addAccount = () => {
    if (!selectedBank || !canAdd) return;
    onAddBankAccount({
      bankName: selectedBank.shortName || selectedBank.name,
      bankCode: selectedBank.code,
      accountNumber,
      accountHolder: accountHolder.trim().toUpperCase(),
      balance: openingBalance === '' ? 0 : openingBalance,
      lastSynced: new Date().toLocaleString('vi-VN', { hour12: false }),
      status: 'connected',
      isManuallyAdded: true,
    });
    setSelectedBankCode('');
    setAccountNumber('');
    setAccountHolder('');
    setOpeningBalance('');
    setIsAddFormOpen(false);
    setMessage('Đã lưu tài khoản do bạn nhập.');
  };

  const saveBalance = async (account: BankAccount) => {
    const balance = balanceInputs[account.id];
    if (balance === '' || balance === undefined || balance < 0) return;
    setSavingId(account.id);
    setMessage('');
    try {
      await onSaveBalance(account.id, balance);
      setMessage(`Đã lưu số dư ${account.bankName}.`);
    } catch (error: any) {
      setMessage(error.message || 'Không thể lưu số dư.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-3 sm:p-5">
      <div className="my-auto w-full max-w-3xl overflow-hidden rounded-[28px] border border-zinc-800 bg-[#18181b] text-zinc-100 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-zinc-800 bg-[#121214] p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-3 text-indigo-400"><Landmark className="h-5 w-5" /></div>
            <div><h2 className="text-lg font-black text-white">Tài Khoản & Số Dư</h2><p className="mt-1 text-xs text-zinc-400">Tài khoản liên kết hũ được tính số dư tự động; RoFinance không kết nối hoặc đọc dữ liệu ngân hàng.</p></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="cursor-pointer rounded-xl p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"><X className="h-5 w-5" /></button>
        </header>

        <div className="max-h-[75vh] space-y-4 overflow-y-auto p-4 sm:p-6">
          {message && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{message}</div>}

          <section className="rounded-2xl border border-zinc-800 bg-[#121214] p-4">
            <button type="button" onClick={() => setIsAddFormOpen((value) => !value)} className="flex w-full cursor-pointer items-center justify-between gap-3 text-left">
              <div><div className="text-sm font-black text-white">Thêm tài khoản</div><div className="mt-1 text-xs text-zinc-400">Chọn ngân hàng rồi tự nhập số tài khoản, tên chủ tài khoản và số dư.</div></div>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white"><Plus className="h-4 w-4" /></span>
            </button>
            {isAddFormOpen && <div className="mt-4 grid gap-3 border-t border-zinc-800 pt-4 sm:grid-cols-2">
              <Field label="Ngân hàng"><select value={selectedBankCode} onChange={(event) => setSelectedBankCode(event.target.value)} className={inputClass}><option value="">Chọn ngân hàng</option>{BANK_OPTIONS.map((bank) => <option key={bank.code} value={bank.code}>{bank.shortName}</option>)}</select></Field>
              <Field label="Số tài khoản"><input inputMode="numeric" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value.replace(/\D/g, '').slice(0, 19))} placeholder="Nhập 6–19 chữ số" className={`${inputClass} font-mono`} /></Field>
              <Field label="Tên chủ tài khoản"><input value={accountHolder} maxLength={100} onChange={(event) => setAccountHolder(event.target.value.toUpperCase().slice(0, 100))} placeholder="Nhập đúng tên hiển thị tại ngân hàng" className={inputClass} /></Field>
              <Field label="Số dư hiện tại"><CurrencyInput value={openingBalance} onValueChange={setOpeningBalance} min={0} hideAmount={isAmountsHidden} className={`${inputClass} text-right font-mono font-bold`} /></Field>
              <button type="button" onClick={addAccount} disabled={!canAdd} className="sm:col-span-2 inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"><Save className="h-4 w-4" />Lưu tài khoản</button>
            </div>}
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Danh sách tài khoản</h3>
            {bankAccounts.map((account) => {
              const linkedJars = getJarsLinkedToBankAccount(jars, account);
              const isDerivedFromJars = linkedJars.length > 0;
              return (
                <article key={account.id} className="grid gap-3 rounded-2xl border border-zinc-800 bg-[#121214] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="text-sm font-black text-white">{account.bankName}</div>
                    <div data-no-translate="true" className="mt-1 truncate font-mono text-xs text-zinc-400">{account.accountNumber} · {account.accountHolder}</div>
                    <div className="mt-1 text-[10px] text-zinc-500">
                      {isDerivedFromJars ? `Tự động tổng hợp từ ${linkedJars.length} hũ` : `Lưu thủ công: ${account.lastSynced}`}
                    </div>
                  </div>
                  {isDerivedFromJars ? (
                    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-2.5 text-right font-mono text-sm font-black text-indigo-200 sm:min-w-44">
                      {formatVND(getDerivedBankBalance(jars, account), isAmountsHidden)}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <CurrencyInput id={`manual-balance-${account.id}`} value={balanceInputs[account.id] ?? account.balance} onValueChange={(value) => setBalanceInputs((current) => ({ ...current, [account.id]: value }))} min={0} hideAmount={isAmountsHidden} className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-[#1c1c20] px-3 py-2 text-right font-mono text-sm font-bold text-white outline-none focus:border-indigo-500 sm:w-44" />
                      <button type="button" onClick={() => saveBalance(account)} disabled={savingId === account.id} aria-label={`Lưu số dư ${account.bankName}`} className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"><Save className="h-4 w-4" /></button>
                      {account.isManuallyAdded && <button type="button" onClick={() => onDeleteBankAccount(account.id)} aria-label={`Xóa ${account.bankName}`} className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-rose-500/20 text-rose-400 hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  )}
                </article>
              );
            })}
            {bankAccounts.length === 0 && <div className="rounded-2xl border border-dashed border-zinc-700 p-8 text-center text-xs text-zinc-500">Chưa có tài khoản. Hãy thêm tài khoản đầu tiên bằng biểu mẫu phía trên.</div>}
          </section>
        </div>
      </div>
    </div>
  );
};

const inputClass = 'w-full rounded-xl border border-zinc-700 bg-[#1c1c20] px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500';
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="space-y-1.5 text-xs font-bold text-zinc-300"><span>{label}</span>{children}</label>;
