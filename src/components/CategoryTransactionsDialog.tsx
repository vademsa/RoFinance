import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { BankAccount, Jar, Transaction } from '../types';
import type { CategoryTotal } from '../utils/analytics';
import { formatDateVI, formatVND } from '../utils/formatters';
import { getRuntimePreferences } from '../lib/preferences';
import { localizeText } from './TranslationLayer';

const PAGE_SIZE = 10;

export function CategoryTransactionsDialog({ category, type, transactions, jars, bankAccounts, period, onClose, showOriginalCategories = false }: {
  category: CategoryTotal; type: 'income' | 'expense'; transactions: Transaction[];
  jars: Jar[]; bankAccounts: BankAccount[]; period: string; onClose: () => void;
  showOriginalCategories?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const outsideDown = useRef(false);
  const body = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const language = getRuntimePreferences().language;
  const t = (vi: string, en: string) => language === 'en' ? en : vi;
  const name = category.isCustom ? category.name : localizeText(category.name, language);
  const pages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => {
      element.close(); document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  const outside = (event: React.MouseEvent<HTMLDialogElement> | React.PointerEvent<HTMLDialogElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  };
  const changePage = (value: number) => { setPage(value); body.current?.scrollTo({ top: 0 }); };
  const buttonStyle = 'flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border border-zinc-700 px-2 text-zinc-200 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40';
  return createPortal(
    <dialog ref={dialog} data-no-translate="true" aria-labelledby="category-transactions-title"
      className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-1.5rem)] max-w-2xl overflow-hidden rounded-3xl border border-zinc-700 bg-[#18181b] p-0 text-zinc-100 shadow-2xl backdrop:bg-black/65 backdrop:backdrop-blur-sm"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onPointerDown={event => { outsideDown.current = event.target === event.currentTarget && outside(event); }}
      onClick={event => { if (outsideDown.current && event.target === event.currentTarget && outside(event)) onClose(); }}>
      <div className="flex max-h-[85dvh] flex-col">
        <header className="flex items-start justify-between gap-3 border-b border-zinc-800 bg-[#121214] p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-indigo-300">{t('Giao dịch theo danh mục', 'Category transactions')} · {type === 'expense' ? t('Chi', 'Expenses') : t('Thu', 'Income')}</p>
            <h2 id="category-transactions-title" className="mt-1 break-words text-lg font-black text-white">{name}</h2>
            <p className="mt-1 text-xs text-zinc-400">{period}</p>
            <p className="mt-2 text-xs text-zinc-300">{transactions.length} {t('giao dịch', transactions.length === 1 ? 'transaction' : 'transactions')} · <strong className="font-mono text-white">{formatVND(total)}</strong></p>
          </div>
          <button type="button" autoFocus aria-label={t('Đóng chi tiết danh mục', 'Close category details')} onClick={onClose} className={buttonStyle}><X className="h-5 w-5" aria-hidden="true" /></button>
        </header>
        <div ref={body} className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">
          <ul className="space-y-3">
            {transactions.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(tx => {
              const account = bankAccounts.find(account => account.id === tx.bankAccountId);
              const jar = jars.find(jar => jar.id === tx.jarId);
              const source = account ? `${account.bankName} · ${account.accountNumber}`
                : tx.paymentMethodCode === 'CASH' ? t('Tiền mặt', 'Cash')
                : [tx.bankName || tx.legacyPaymentLabel, tx.sourceAccountNumber].filter(Boolean).join(' · ') || t('Chưa ghi tài khoản', 'Account not recorded');
              const jarLabel = tx.allocations?.length ? tx.allocations.map(allocation => {
                const allocatedJar = jars.find(jar => jar.id === allocation.jarId);
                return `${allocatedJar?.name || allocation.jarId}: ${formatVND(allocation.amount)}`;
              }).join(' · ') : jar?.name || (tx.jarId ? t('Hũ đã lưu trữ', 'Archived jar') : t('Ngoài hũ', 'Outside jars'));
              return <li key={tx.id} className="rounded-2xl border border-zinc-800 bg-[#121214] p-3 sm:p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <time dateTime={tx.date} className="text-xs font-semibold text-zinc-400">{formatDateVI(tx.date)}</time>
                  <strong className={'break-all font-mono text-sm ' + (type === 'expense' ? 'text-rose-400' : 'text-emerald-400')}>{type === 'expense' ? '−' : '+'}{formatVND(tx.amount)}</strong>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold text-white">{tx.description || t('Không có diễn giải', 'No description')}</p>
                <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
                  {showOriginalCategories && <><dt className="text-zinc-500">{t('Danh mục gốc', 'Original category')}</dt><dd className="break-words text-zinc-300">{tx.categoryId?.startsWith('custom-') ? tx.category : localizeText(tx.category?.trim() || 'Chưa phân loại', language)}</dd></>}
                  <dt className="text-zinc-500">{t('Hũ', 'Jar')}</dt><dd className="break-words text-zinc-300">{jarLabel}</dd>
                  <dt className="text-zinc-500">{t('Tài khoản', 'Account')}</dt><dd className="break-words text-zinc-300">{source}</dd>
                  {tx.counterpartyName && <><dt className="text-zinc-500">{t('Đối tác', 'Counterparty')}</dt><dd className="break-words text-zinc-300">{tx.counterpartyName}</dd></>}
                  {tx.recipientAccount && <><dt className="text-zinc-500">{t('Bên nhận', 'Recipient')}</dt><dd className="break-words text-zinc-300">{[tx.recipientBank, tx.recipientAccount].filter(Boolean).join(' · ')}</dd></>}
                  {tx.bankTransactionId && <><dt className="text-zinc-500">{t('Mã ngân hàng', 'Bank reference')}</dt><dd className="break-words text-zinc-300">{tx.bankTransactionId}</dd></>}
                </dl>
              </li>;
            })}
          </ul>
        </div>
        {pages > 1 && <footer className="flex items-center justify-between gap-2 border-t border-zinc-800 p-3">
          <button type="button" className={buttonStyle} aria-label={t('Giao dịch trước', 'Previous transactions')} disabled={!currentPage} onClick={() => changePage(currentPage - 1)}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
          <span aria-live="polite" className="text-xs text-zinc-400">{t('Trang', 'Page')} {currentPage + 1}/{pages}</span>
          <button type="button" className={buttonStyle} aria-label={t('Giao dịch tiếp theo', 'Next transactions')} disabled={currentPage === pages - 1} onClick={() => changePage(currentPage + 1)}><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
        </footer>}
      </div>
    </dialog>, document.body,
  );
}
