import React, { useEffect, useMemo, useState } from 'react';
import { FileUp, Plus, Trash2, X } from 'lucide-react';
import type { BankAccount, Jar, MonthlyCycleSummary, Transaction, TransactionCategory } from '../types';
import { getTransactionCategories } from '../constants/categories';
import { getJarsLinkedToBankAccount, normalizeAccountNumber, syncBankAccountsWithJars } from '../utils/bankAccounts';
import { getBackdatableJarIds, getFinancialCycleStart, isDateInCycle, parseLocalDate, toLocalDateKey } from '../utils/monthlyCycle';
import { getHistoricalSummaryForDate } from '../utils/historicalBalances';
import { detectStatementSheet, filterStatementRowsByDateRange, parseStatementAmount, parseStatementDate, parseStatementRows, statementBankId, type StatementColumn, type StatementRow, type StatementSheet } from '../utils/statementImport';
import { formatVND } from '../utils/formatters';
import { getRuntimePreferences } from '../lib/preferences';
import { findPaymentMethodByCode } from '../../shared/banks';

type Draft = StatementRow & { key: string; jarId: string; categoryId: string; selected: boolean; warning?: string; isPlaceholder?: boolean };
type Props = {
  mode: 'statement' | 'bulk' | null;
  onClose: () => void;
  onSave: (items: Omit<Transaction, 'id'>[]) => boolean;
  transactions: Transaction[];
  jars: Jar[];
  bankAccounts: BankAccount[];
  categories: TransactionCategory[];
  monthlySummaries: MonthlyCycleSummary[];
  resetDay: number;
  isAmountsHidden: boolean;
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 1000;
const MAX_SHEET_ROWS = 5000;
const money = (value: number, hidden: boolean) => formatVND(value, hidden);
const normalizedDescription = (text: string) => text.trim().toLocaleLowerCase('vi-VN').replace(/\s+/g, ' ');

export const TransactionImportModal: React.FC<Props> = ({ mode, onClose, onSave, transactions, jars, bankAccounts,
  categories, monthlySummaries, resetDay, isAmountsHidden }) => {
  const [accountId, setAccountId] = useState('');
  const [sheet, setSheet] = useState<StatementSheet | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pasteValue, setPasteValue] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [rangeSkipped, setRangeSkipped] = useState(0);
  const isEnglish = getRuntimePreferences().language === 'en';
  const importAccounts = useMemo(() => syncBankAccountsWithJars(jars, bankAccounts, transactions), [jars, bankAccounts, transactions]);
  const account = importAccounts.find((item) => item.id === accountId);
  const linkedJars = account ? getJarsLinkedToBankAccount(jars, account) : [];
  const sameNumberJars = account ? jars.filter((jar) =>
    normalizeAccountNumber(jar.accountNumber) === normalizeAccountNumber(account.accountNumber)) : [];
  const currentStart = getFinancialCycleStart(new Date(), resetDay);
  const today = toLocalDateKey(new Date());
  const existingBankIds = useMemo(() => new Set(transactions.map((item) => item.bankTransactionId).filter(Boolean)), [transactions]);

  useEffect(() => {
    if (!mode) return;
    const firstJar = jars[0];
    const initialCategory = firstJar
      ? getTransactionCategories('expense', firstJar.code, categories).find((item) => item.id.endsWith('-other'))
        || getTransactionCategories('expense', firstJar.code, categories)[0]
      : undefined;
    setSheet(null);
    setDrafts(mode === 'bulk' ? [{ key: crypto.randomUUID(), rowNumber: 1, date: today, type: 'expense',
      amount: 0, description: '', reference: '', jarId: firstJar?.id || '',
      categoryId: initialCategory?.id || '', selected: true, isPlaceholder: true }] : []);
    setParseErrors([]); setError(''); setPasteValue(''); setFromDate(''); setToDate(''); setRangeSkipped(0);
    setAccountId(importAccounts[0]?.id || '');
  }, [mode]);
  if (!mode) return null;

  const message = (vi: string, en: string) => isEnglish ? en : vi;
  const defaultCategoryId = (type: 'income' | 'expense', jarId: string) => {
    const jar = jars.find((item) => item.id === jarId);
    const options = getTransactionCategories(type, jar?.code, categories);
    return (options.find((item) => item.id.endsWith('-other')) || options[0])?.id || '';
  };
  const historicalIds = (date: string) => getBackdatableJarIds(
    getHistoricalSummaryForDate(monthlySummaries, date, resetDay));
  const availableJars = (date: string) => date >= toLocalDateKey(currentStart)
    ? jars : jars.filter((jar) => historicalIds(date).has(jar.id));
  const statementJars = (date: string, chosenAccount = account) => chosenAccount
    ? getJarsLinkedToBankAccount(availableJars(date), chosenAccount)
    : [];
  const statementManualJars = (date: string, chosenAccount = account) => chosenAccount
    ? date >= toLocalDateKey(currentStart) ? getJarsLinkedToBankAccount(jars, chosenAccount) : availableJars(date)
    : [];
  const jarOptions = (date: string) => mode === 'statement' ? statementManualJars(date) : availableJars(date);
  const buildDrafts = (items: StatementRow[], chosenAccount: BankAccount | null = mode === 'statement' ? account || null : null) => {
    const seenRefs = new Set<string>();
    const seenFallback = new Set<string>();
    return items.map((item) => {
      const bankId = chosenAccount ? statementBankId(chosenAccount.bankCode, chosenAccount.accountNumber, item.reference) : undefined;
      const fallback = `${item.date}|${item.type}|${item.amount}|${normalizedDescription(item.description)}`;
      const possibleDuplicate = transactions.some((tx) => tx.date === item.date && tx.type === item.type &&
        tx.amount === item.amount && normalizedDescription(tx.description) === normalizedDescription(item.description));
      const hardDuplicate = Boolean(bankId && (existingBankIds.has(bankId) || seenRefs.has(bankId)));
      const softDuplicate = !bankId && (possibleDuplicate || seenFallback.has(fallback));
      if (bankId) seenRefs.add(bankId); else seenFallback.add(fallback);
      const options = mode === 'statement' && chosenAccount
        ? statementJars(item.date, chosenAccount) : availableJars(item.date);
      const jarId = options[0]?.id || '';
      return { ...item, key: crypto.randomUUID(), jarId,
        categoryId: jarId ? defaultCategoryId(item.type, jarId) : '',
        selected: mode === 'bulk' && !hardDuplicate && !softDuplicate && item.date <= today,
        warning: hardDuplicate ? message('Đã nhập mã bút toán này', 'Bank reference already imported')
          : softDuplicate ? message('Có thể trùng giao dịch đã có', 'Possible duplicate') : undefined };
    });
  };
  const applyDateRange = (rows: StatementRow[], from = fromDate, to = toDate) => {
    if (from && to && from > to) {
      setError(message('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.', 'Start date must not be after end date.'));
      setDrafts([]);
      return;
    }
    const matching = filterStatementRowsByDateRange(rows, from, to);
    setRangeSkipped(rows.length - matching.length);
    setDrafts(buildDrafts(matching));
    setError('');
  };
  const readFile = async (file: File) => {
    setError(''); setParseErrors([]); setDrafts([]); setSheet(null);
    if (!account) { setError(message('Chọn tài khoản ngân hàng trước.', 'Select a bank account first.')); return; }
    if (!/\.(xlsx|xls|csv)$/i.test(file.name) || file.size > MAX_FILE_BYTES) {
      setError(message('Chỉ hỗ trợ CSV/XLS/XLSX tối đa 5 MB.', 'Use a CSV/XLS/XLSX file up to 5 MB.')); return;
    }
    setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellFormula: false, cellHTML: false,
        sheetRows: MAX_SHEET_ROWS });
      const first = workbook.Sheets[workbook.SheetNames[0]];
      if (!first) throw new Error(message('Tệp không có bảng dữ liệu.', 'No worksheet found.'));
      const raw = XLSX.utils.sheet_to_json<(string | number)[]>(first, { header: 1, raw: false, defval: '' });
      if (raw.length >= MAX_SHEET_ROWS) throw new Error(message('Trang tính quá dài; hãy chia sao kê thành các tệp nhỏ hơn.', 'Worksheet is too long; split the statement into smaller files.'));
      const detected = detectStatementSheet(raw.map((row) => row.map((cell) => String(cell ?? ''))));
      if (detected.accountNumber && normalizeAccountNumber(detected.accountNumber) !== normalizeAccountNumber(account.accountNumber)) {
        throw new Error(message('Số tài khoản trong sao kê không khớp tài khoản đã chọn.', 'Statement account number does not match the selected account.'));
      }
      if (detected.format === 'techcombank' && account.bankCode !== 'TCB') {
        throw new Error(message('Sao kê Techcombank phải nhập vào tài khoản Techcombank.', 'Select a Techcombank account for this statement.'));
      }
      setSheet(detected);
      const parsed = parseStatementRows(detected);
      if (parsed.rows.length > MAX_ROWS) throw new Error(message('Tệp vượt quá 1.000 giao dịch.', 'File exceeds 1,000 transactions.'));
      setParseErrors(parsed.errors.slice(0, 12));
      applyDateRange(parsed.rows);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const remap = (column: StatementColumn, index: number) => {
    if (!sheet) return;
    const next = { ...sheet, mapping: { ...sheet.mapping, [column]: index } };
    setSheet(next);
    const parsed = parseStatementRows(next);
    setParseErrors(parsed.errors.slice(0, 12));
    applyDateRange(parsed.rows);
  };
  const update = (key: string, patch: Partial<Draft>) => setDrafts((current) => current.map((item) => {
    if (item.key !== key) return item;
    const next = { ...item, ...patch, isPlaceholder: false };
    if (patch.jarId !== undefined || patch.type !== undefined) {
      next.categoryId = next.jarId ? defaultCategoryId(next.type, next.jarId) : '';
    }
    return next;
  }));
  const addEmptyBulkRow = () => {
    if (drafts.length >= MAX_ROWS) { setError(message('Tối đa 1.000 dòng.', 'Maximum 1,000 rows.')); return; }
    const jarId = jars[0]?.id || '';
    setDrafts((current) => [...current, { key: crypto.randomUUID(), rowNumber: current.length + 1,
      date: today, type: 'expense', amount: 0, description: '', reference: '', jarId,
      categoryId: defaultCategoryId('expense', jarId), selected: true, isPlaceholder: true }]);
    setError('');
  };
  const removeBulkRow = (key: string) => {
    setDrafts((current) => current.filter((item) => item.key !== key));
    setError('');
  };
  const addBulk = (items: StatementRow[]) => {
    const replaceEmpty = drafts.length === 1 && drafts[0].isPlaceholder;
    if (drafts.length - Number(replaceEmpty) + items.length > MAX_ROWS) {
      setError(message('Tối đa 1.000 dòng.', 'Maximum 1,000 rows.'));
      return false;
    }
    setDrafts((current) => [...(replaceEmpty ? [] : current), ...buildDrafts(items, null)]);
    setError('');
    return true;
  };
  const parsePaste = () => {
    const rows: StatementRow[] = [];
    const errors: string[] = [];
    pasteValue.split(/\r?\n/).filter((line) => line.trim()).forEach((line, index) => {
      const [dateRaw, typeRaw, amountRaw, ...descriptionRaw] = line.split('\t');
      const date = parseStatementDate(dateRaw || '');
      const typeText = String(typeRaw || '').trim().toLowerCase();
      const type = ['thu', 'income', '+'].includes(typeText) ? 'income' : ['chi', 'expense', '-'].includes(typeText) ? 'expense' : null;
      const amount = parseStatementAmount(amountRaw || '');
      const description = descriptionRaw.join(' ').trim();
      if (!date || !type || !amount || !description) errors.push(`Dòng ${index + 1}: sai ngày, loại, số tiền hoặc diễn giải.`);
      else rows.push({ rowNumber: index + 1, date, type, amount, description, reference: '' });
    });
    setParseErrors(errors.slice(0, 12));
    if (errors.length) return;
    if (addBulk(rows)) setPasteValue('');
  };
  const validate = (item: Draft) => {
    if (!item.selected) return '';
    if (!item.date || item.date > today || !parseLocalDate(item.date)) return message('Ngày giao dịch không hợp lệ hoặc nằm trong tương lai.', 'Invalid or future transaction date.');
    const options = jarOptions(item.date);
    if (!options.some((jar) => jar.id === item.jarId)) return message('Chọn hũ hợp lệ.', 'Select a valid jar.');
    if (!item.categoryId) return message('Chọn danh mục.', 'Select a category.');
    if (!Number.isSafeInteger(item.amount) || item.amount <= 0) return message('Số tiền không hợp lệ.', 'Invalid amount.');
    if (!item.description.trim() || item.description.length > 500 || /[\u0000-\u001f\u007f]/.test(item.description)) {
      return message('Diễn giải phải có nội dung và không quá 500 ký tự.', 'Description is required and must be at most 500 characters.');
    }
    const bankId = mode === 'statement' && account ? statementBankId(account.bankCode, account.accountNumber, item.reference) : undefined;
    if (bankId && existingBankIds.has(bankId)) return message('Mã bút toán đã nhập.', 'Bank reference already imported.');
    return '';
  };
  const draftWarning = (item: Draft) => {
    if (item.warning) return item.warning;
    if (item.date > today || !parseLocalDate(item.date)) {
      return message('Ngày giao dịch không hợp lệ hoặc nằm trong tương lai', 'Invalid or future transaction date');
    }
    if (mode !== 'statement') return '';
    const options = statementManualJars(item.date);
    if (!options.length) {
      return item.date < toLocalDateKey(currentStart)
        ? message('Chu kỳ này chưa có hũ với số dư đầu kỳ đã đối soát. Hãy nhập số dư hũ quá khứ trước.',
          'No jar has a reconciled opening balance for this cycle. Add a past jar balance first.')
        : message('Tài khoản này chưa liên kết với hũ nào.', 'This account is not linked to any jar.');
    }
    if (!item.jarId) return message('Không tự ghép được hũ. Hãy chọn thủ công hũ của chu kỳ này.',
      'No automatic jar match. Select a jar for this cycle manually.');
    return '';
  };
  const selected = drafts.filter((item) => item.selected);
  const invalid = selected.filter(validate);
  const unavailablePreviousRows = mode === 'statement' ? drafts.filter((item) =>
    item.date < toLocalDateKey(currentStart) &&
    statementManualJars(item.date).length === 0).length : 0;
  const totalIncome = selected.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0);
  const totalExpense = selected.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0);
  const impacts = Array.from(selected.reduce((groups, item) => {
    const parsed = parseLocalDate(item.date);
    const cycle = parsed ? toLocalDateKey(getFinancialCycleStart(parsed, resetDay)) : 'invalid';
    const key = `${cycle}:${item.jarId}`;
    const previous = groups.get(key) || { cycle, jarId: item.jarId, income: 0, expense: 0, count: 0 };
    groups.set(key, { ...previous, income: previous.income + (item.type === 'income' ? item.amount : 0),
      expense: previous.expense + (item.type === 'expense' ? item.amount : 0), count: previous.count + 1 });
    return groups;
  }, new Map<string, { cycle: string; jarId: string; income: number; expense: number; count: number }>()).values());
  const save = () => {
    if (!selected.length || invalid.length) return;
    const items: Omit<Transaction, 'id'>[] = selected.map((item) => {
      const jar = jars.find((entry) => entry.id === item.jarId)!;
      const category = getTransactionCategories(item.type, jar.code, categories).find((entry) => entry.id === item.categoryId)!;
      return { type: item.type, amount: item.amount, jarId: jar.id, date: item.date, description: item.description,
        category: category.name, categoryId: category.id, categoryIcon: category.icon,
        paymentMethodCode: mode === 'statement' ? account!.bankCode : (jar.bankCode || 'CASH'),
        bankName: findPaymentMethodByCode(mode === 'statement' ? account!.bankCode : (jar.bankCode || 'CASH'))!.shortName,
        sourceAccountNumber: mode === 'statement' ? account!.accountNumber : jar.accountNumber,
        bankTransactionId: mode === 'statement' ? statementBankId(account!.bankCode, account!.accountNumber, item.reference) : undefined,
        allocations: item.type === 'income' ? [{ jarId: jar.id, amount: item.amount }] : undefined };
    });
    if (onSave(items)) onClose();
    else setError(message('Không thể lưu lô giao dịch. Xem thông báo lỗi phía trên.', 'Could not save the batch. Check the error above.'));
  };

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-2 sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="transaction-import-title" className="flex max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-[#121214] text-zinc-100 shadow-2xl">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 sm:px-6">
        <div><h2 id="transaction-import-title" className="text-lg font-bold text-white">{mode === 'statement' ? message('Nhập sao kê ngân hàng', 'Import bank statement') : message('Ghi chép hàng loạt', 'Bulk entry')}</h2>
          <p className="text-xs text-zinc-400">{message('Xem trước → chọn hũ và danh mục → xác nhận. Không tự lưu khi tải tệp.', 'Preview → assign jar and category → confirm. Uploading does not save transactions.')}</p></div>
        <button type="button" aria-label={message('Đóng', 'Close')} onClick={onClose} className="rounded-lg p-2 hover:bg-zinc-800"><X size={20}/></button>
      </header>
      <div className="space-y-4 overflow-y-auto p-4 sm:p-6">
        {mode === 'statement' ? <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold">{message('Tài khoản nhận sao kê', 'Statement account')}
              <select className="form-input mt-1" value={accountId} onChange={(event) => { setAccountId(event.target.value); setSheet(null); setDrafts([]); }}>
                <option value="">{message('Chọn tài khoản', 'Select account')}</option>
                {importAccounts.map((item) => <option key={item.id} value={item.id}>{item.bankName} · {item.accountNumber} · {getJarsLinkedToBankAccount(jars, item).length} {message('hũ', 'jars')}</option>)}
              </select></label>
            <label className="text-xs font-semibold">{message('Tệp CSV / XLS / XLSX (tối đa 5 MB)', 'CSV / XLS / XLSX file (max 5 MB)')}
              <span className={`form-input mt-1 flex items-center gap-2 ${!account ? 'opacity-50' : ''}`}><FileUp size={16}/>{busy ? message('Đang đọc...', 'Reading...') : message('Chọn sao kê', 'Choose statement')}</span>
              <input type="file" accept=".csv,.xls,.xlsx" className="sr-only" disabled={!account || busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); event.target.value = ''; }}/>
            </label>
          </div>
          <div className="grid gap-3 rounded-xl border border-zinc-700 bg-[#1c1c20] p-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-zinc-200">{message('Từ ngày (không bắt buộc)', 'From date (optional)')}
              <input type="date" className="form-input mt-1" value={fromDate} max={today} onChange={(event) => {
                const value = event.target.value; setFromDate(value);
                if (sheet) applyDateRange(parseStatementRows(sheet).rows, value, toDate);
              }}/></label>
            <label className="text-xs font-semibold text-zinc-200">{message('Đến ngày (không bắt buộc)', 'To date (optional)')}
              <input type="date" className="form-input mt-1" value={toDate} max={today} onChange={(event) => {
                const value = event.target.value; setToDate(value);
                if (sheet) applyDateRange(parseStatementRows(sheet).rows, fromDate, value);
              }}/></label>
            <p className="text-[11px] text-zinc-400 sm:col-span-2">{message('Khoảng ngày chỉ lọc giao dịch trong sao kê; mỗi dòng vẫn được tính vào chu kỳ lương theo ngày giao dịch.',
              'This range only filters statement rows; each transaction is still assigned to its salary cycle by its own date.')}</p>
          </div>
          {rangeSkipped > 0 && <p role="status" className="text-xs text-zinc-400">{message(`Đã bỏ qua ${rangeSkipped} dòng ngoài khoảng ngày.`, `${rangeSkipped} rows outside the date range were excluded.`)}</p>}
          {account && <div role={linkedJars.length ? 'status' : 'alert'} className={`rounded-xl border p-3 text-xs ${linkedJars.length
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
            {linkedJars.length
              ? linkedJars.length === 1
                ? message(`Đã liên kết hũ ${linkedJars[0].name} cho chu kỳ hiện tại. Dòng chu kỳ trước chỉ tự gán nếu hũ có bản ghi số dư của chu kỳ đó.`,
                  `Linked to ${linkedJars[0].name} for the current cycle. Previous-cycle rows are auto-assigned only when that jar has a historical balance snapshot.`)
                : message(`${linkedJars.length} hũ dùng chung tài khoản này trong chu kỳ hiện tại. Kiểm tra hũ của từng dòng trước khi nhập.`,
                  `${linkedJars.length} jars share this account in the current cycle. Review each row's jar before importing.`)
              : sameNumberJars.length
                ? message('Có hũ dùng cùng số tài khoản nhưng khác ngân hàng. Hãy sửa ngân hàng trong cấu hình hũ hoặc chọn đúng tài khoản.',
                  'A jar has this account number under another bank. Correct the jar bank or select the matching account.')
                : message('Tài khoản này chưa liên kết hũ hiện tại. Dòng chu kỳ cũ vẫn có thể chọn thủ công hũ đã được đối soát số dư.',
                  'This account is not linked to a current jar. Older rows can still use a manually selected jar with a reconciled balance.')}
          </div>}
          {sheet && <div className="rounded-xl border border-zinc-700 bg-[#1c1c20] p-3 text-xs">
            <p className="mb-2 font-bold">{sheet.format === 'techcombank' ? 'Techcombank' : message('Ánh xạ cột', 'Column mapping')} · {message('hàng tiêu đề', 'header row')} {sheet.headerRow + 1}</p>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">{(['date', 'description', 'debit', 'credit', 'reference'] as StatementColumn[]).map((column) =>
              <label key={column}>{({ date: message('Ngày', 'Date'), description: message('Diễn giải', 'Description'), debit: message('Chi', 'Debit'), credit: message('Thu', 'Credit'), reference: message('Mã bút toán', 'Reference') })[column]}
                <select className="form-input mt-1" value={sheet.mapping[column]} onChange={(event) => remap(column, Number(event.target.value))}>
                  <option value={-1}>{message('Không có', 'None')}</option>
                  {sheet.rows[sheet.headerRow].map((cell, index) => cell.trim() && <option key={index} value={index}>{cell.replace(/\s+/g, ' ').slice(0, 38)}</option>)}
                </select></label>)}</div>
          </div>}
        </> : <details className="rounded-xl border border-zinc-700 bg-[#1c1c20] p-3 text-xs">
          <summary className="cursor-pointer font-semibold text-indigo-300">{message('Tùy chọn: dán nhiều dòng từ bảng tính', 'Optional: paste rows from a spreadsheet')}</summary>
          <label className="mt-3 block font-semibold">{message('Cột: Ngày → Loại (thu/chi) → Số tiền → Diễn giải, ngăn bằng Tab', 'Columns: Date → Type (income/expense) → Amount → Description, tab-separated')}
            <textarea className="form-input mt-2 min-h-20" value={pasteValue} onChange={(event) => setPasteValue(event.target.value)} placeholder={'05/10/2026\tchi\t30000\tĂn sáng'}/></label>
          <button type="button" onClick={parsePaste} disabled={!pasteValue.trim()} className="mt-2 rounded-lg bg-indigo-600 px-3 py-2 font-bold text-white disabled:opacity-50">{message('Thêm dòng đã dán', 'Add pasted rows')}</button>
        </details>}
        {error && <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>}
        {parseErrors.length > 0 && <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300"><p>{message('Dòng không đọc được (không đưa vào lô):', 'Rows not parsed (excluded):')}</p>{parseErrors.map((item) => <p key={item}>{item}</p>)}</div>}
        {unavailablePreviousRows > 0 && <p role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
          {message(`${unavailablePreviousRows} dòng thuộc chu kỳ cũ chưa có hũ đã đối soát số dư đầu kỳ. Hãy nhập số dư hũ quá khứ cho từng chu kỳ cần dùng, rồi tải lại sao kê.`,
            `${unavailablePreviousRows} older rows have no jar with a reconciled opening balance. Add a past jar balance for each required cycle, then reload the statement.`)}
        </p>}
        {mode === 'bulk' && <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-zinc-400">{message('Nhập trực tiếp từng dòng; hũ và danh mục có thể đổi trước khi lưu.', 'Enter each row directly; jar and category can be changed before saving.')}</p>
          <button type="button" onClick={addEmptyBulkRow} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-600 px-3 py-2 text-xs font-bold text-zinc-200 transition-colors hover:border-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><Plus size={15}/>{message('Thêm dòng', 'Add row')}</button>
        </div>}
        {drafts.length > 0 && <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><p>{message('Đã chọn', 'Selected')} {selected.length}/{drafts.length} · {message('Thu', 'Income')} {money(totalIncome, isAmountsHidden)} · {message('Chi', 'Expense')} {money(totalExpense, isAmountsHidden)}</p>
            <div className="flex gap-2"><button type="button" className="text-indigo-400 underline" onClick={() => setDrafts((items) => items.map((item) => ({ ...item, selected: !draftWarning(item) && !validate({ ...item, selected: true }) })))}>{message('Chọn dòng hợp lệ', 'Select clear rows')}</button><button type="button" className="text-zinc-400 underline" onClick={() => setDrafts((items) => items.map((item) => ({ ...item, selected: false })))}>{message('Bỏ chọn hết', 'Clear selection')}</button></div></div>
          {impacts.length > 0 && <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-xs">
            <p className="mb-2 font-bold">{message('Tác động dự kiến theo chu kỳ và hũ', 'Estimated impact by cycle and jar')}</p>
            <div className="grid gap-1 sm:grid-cols-2">{impacts.map((impact) => <p key={`${impact.cycle}:${impact.jarId}`}>
              {message('Chu kỳ', 'Cycle')} {impact.cycle} · {jars.find((jar) => jar.id === impact.jarId)?.name || message('Chưa chọn hũ', 'No jar selected')} · {impact.count} {message('dòng', 'rows')} · +{money(impact.income, isAmountsHidden)} / -{money(impact.expense, isAmountsHidden)}
            </p>)}</div>
          </div>}
          {mode === 'statement' && <p className="text-xs text-amber-300">{message('Sao kê không tự chọn dòng. Hãy loại các khoản chuyển giữa tài khoản của chính bạn để tránh tính hai lần.', 'Statement rows start unselected. Exclude transfers between your own accounts to avoid double-counting.')}</p>}
          <div className="space-y-2">{drafts.map((item, index) => {
            const options = jarOptions(item.date);
            const jar = jars.find((entry) => entry.id === item.jarId);
            const categoryOptions = getTransactionCategories(item.type, jar?.code, categories);
            const validation = validate(item);
            return <div key={item.key} className="rounded-xl border border-zinc-700 bg-[#1c1c20] p-3 text-xs">
              <div className="grid gap-2 sm:grid-cols-[auto_125px_110px_120px_minmax(150px,1fr)] sm:items-end">
                <label className="flex items-center gap-2"><input type="checkbox" checked={item.selected} disabled={Boolean(item.warning?.includes('mã bút toán') || item.warning?.includes('reference already'))} onChange={(event) => update(item.key, { selected: event.target.checked })}/><span>#{mode === 'bulk' ? index + 1 : item.rowNumber}</span></label>
                <label>{message('Ngày', 'Date')}<input type="date" className="form-input mt-1" value={item.date} max={today} onChange={(event) => {
                  const nextDate = event.target.value;
                  const nextOptions = jarOptions(nextDate);
                  const nextJarId = nextOptions.some((entry) => entry.id === item.jarId)
                    ? item.jarId : nextOptions[0]?.id || '';
                  update(item.key, nextJarId === item.jarId ? { date: nextDate } : { date: nextDate, jarId: nextJarId });
                }}/></label>
                <label>{message('Loại', 'Type')}<select className="form-input mt-1" value={item.type} disabled={mode === 'statement'} onChange={(event) => update(item.key, { type: event.target.value as 'income' | 'expense' })}><option value="expense">{message('Chi', 'Expense')}</option><option value="income">{message('Thu', 'Income')}</option></select></label>
                <label>{message('Số tiền', 'Amount')}<input className="form-input mt-1" type={isAmountsHidden ? 'password' : 'number'} inputMode="numeric" value={item.amount || ''} disabled={mode === 'statement'} onChange={(event) => update(item.key, { amount: Number(event.target.value) })}/></label>
                <label>{message('Diễn giải', 'Description')}<input className="form-input mt-1" value={item.description} onChange={(event) => update(item.key, { description: event.target.value.slice(0, 500) })}/></label>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label>{message('Hũ', 'Jar')}<select className="form-input mt-1" value={item.jarId} onChange={(event) => update(item.key, { jarId: event.target.value })}><option value="">{message('Chọn hũ', 'Select jar')}</option>{options.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
                <label>{message('Danh mục', 'Category')}<select className="form-input mt-1" value={item.categoryId} onChange={(event) => update(item.key, { categoryId: event.target.value })}><option value="">{message('Chọn danh mục', 'Select category')}</option>{categoryOptions.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
              </div>
              {mode === 'bulk' && <div className="mt-2 flex justify-end"><button type="button" onClick={() => removeBulkRow(item.key)} aria-label={message(`Xóa dòng ${index + 1}`, `Delete row ${index + 1}`)} className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 px-2.5 py-1.5 font-semibold text-rose-300 transition-colors hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"><Trash2 size={14}/>{message('Xóa dòng', 'Delete row')}</button></div>}
              {(draftWarning(item) || validation) && <p className="mt-2 text-amber-300">{draftWarning(item) || validation}</p>}
              {mode === 'statement' && item.date < toLocalDateKey(currentStart) && item.jarId &&
                !statementJars(item.date).some((entry) => entry.id === item.jarId) &&
                <p className="mt-2 text-amber-300">{message('Hũ này được gán thủ công cho giao dịch cũ; hãy xác nhận khoản thu/chi thực sự thuộc hũ này trước khi lưu.',
                  'This jar was assigned manually to an older transaction. Confirm that this income or expense belongs to it before saving.')}</p>}
            </div>;
          })}</div>
        </>}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 p-4 text-xs sm:px-6">
        <p className="text-zinc-400">{message('Chỉ ghi thu/chi; chuyển tiền giữa tài khoản cần đối soát thủ công.', 'Income and expenses only; reconcile internal transfers manually.')}</p>
        <div className="flex gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-zinc-600 px-4 py-2">{message('Hủy', 'Cancel')}</button><button type="button" onClick={save} disabled={!selected.length || invalid.length > 0 || busy} className="rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white disabled:opacity-40">{message('Xác nhận', 'Confirm')} {selected.length}</button></div>
      </footer>
    </div>
  </div>;
};
