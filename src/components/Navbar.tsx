import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Wallet,
  PlusCircle,
  Landmark,
  Bot,
  FileSpreadsheet,
  Printer,
  Sparkles,
  PieChart,
  Coins,
  Settings2,
  CalendarClock,
  Moon,
  Sun,
  X,
} from 'lucide-react';
import type { AppPreferences } from '../lib/preferences';
import type { AuthUser } from '../lib/api';
import {
  formatCycleDate,
  getFinancialCycleStart,
  getNextFinancialCycleStart,
  normalizeResetDay,
} from '../utils/monthlyCycle';

interface NavbarProps {
  monthlyIncome: number;
  totalSpent: number;
  totalAllocated: number;
  onOpenIncomeModal: () => void;
  onOpenTransactionModal: () => void;
  onOpenBankAccountsModal: () => void;
  onOpenAIAdvisor: () => void;
  onExportExcel: () => void;
  onExportPDF: () => void;
  activeTab: 'jars' | 'transactions' | 'crypto' | 'analytics';
  setActiveTab: (tab: 'jars' | 'transactions' | 'crypto' | 'analytics') => void;
  onOpenAuthModal?: () => void;
  user?: AuthUser | null;
  preferences: AppPreferences;
  onPreferencesChange: (preferences: AppPreferences) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  monthlyIncome,
  totalSpent,
  totalAllocated,
  onOpenIncomeModal,
  onOpenTransactionModal,
  onOpenBankAccountsModal,
  onOpenAIAdvisor,
  onExportExcel,
  onExportPDF,
  activeTab,
  setActiveTab,
  onOpenAuthModal,
  user,
  preferences,
  onPreferencesChange,
}) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>(() =>
    preferences.theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
      : preferences.theme
  );
  const [resetDayDraft, setResetDayDraft] = useState(String(preferences.monthlyResetDay));
  const settingsCloseRef = useRef<HTMLButtonElement>(null);
  const draftResetDay = normalizeResetDay(Number(resetDayDraft));
  const nextResetDate = getNextFinancialCycleStart(
    getFinancialCycleStart(new Date(), draftResetDay),
    draftResetDay,
  );

  useEffect(() => {
    if (!isSettingsOpen) return;
    setResetDayDraft(String(preferences.monthlyResetDay));
    settingsCloseRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsSettingsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsOpen, preferences.monthlyResetDay]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const updateResolvedTheme = () => setResolvedTheme(
      preferences.theme === 'system'
        ? media.matches ? 'light' : 'dark'
        : preferences.theme
    );
    updateResolvedTheme();
    media.addEventListener('change', updateResolvedTheme);
    return () => media.removeEventListener('change', updateResolvedTheme);
  }, [preferences.theme]);

  const toggleTheme = () => onPreferencesChange({
    ...preferences,
    theme: resolvedTheme === 'light' ? 'dark' : 'light',
  });
  return (
    <header className="sticky top-0 z-30 bg-[#09090b]/90 backdrop-blur-md text-zinc-100 pt-2 sm:pt-4 px-2 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-[#121214] border border-zinc-800 rounded-2xl sm:rounded-3xl px-3 sm:px-6 py-2.5 sm:py-3.5 shadow-xl flex items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3">
            <img
              src="/favicon.svg?v=1"
              alt="RoFinance"
              className="w-10 h-10 sm:w-11 sm:h-11 shrink-0 rounded-[14px] object-contain drop-shadow-[0_8px_16px_rgba(59,130,246,0.22)]"
            />
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg tracking-tight text-white">RoFinance</span>
              </div>
              <p className="max-w-44 truncate text-xs text-zinc-400 hidden sm:block">
                {user ? (
                  <>Xin chào, <span data-no-translate="true">{user.displayName}</span></>
                ) : 'Quản lý dòng tiền & Đầu tư'}
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="hidden md:flex items-center space-x-1 bg-[#1c1c20] p-1 rounded-2xl border border-zinc-800">
            <button
              onClick={() => setActiveTab('jars')}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'jars'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              Hũ Tài Chính
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'transactions'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              Chi Tiêu
            </button>
            <button
              onClick={() => setActiveTab('crypto')}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center space-x-1.5 ${
                activeTab === 'crypto'
                  ? 'bg-amber-500 text-zinc-950 font-bold shadow-md shadow-amber-500/20'
                  : 'text-amber-400/90 hover:text-amber-300 hover:bg-zinc-800/60'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>Đầu Tư</span>
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center space-x-1.5 ${
                activeTab === 'analytics'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <PieChart className="w-3.5 h-3.5" />
              <span>Thống Kê</span>
            </button>
          </div>

          {/* Action Buttons */}
          <div className="ml-2 hidden items-center space-x-2 xl:flex">
            <HeaderAction label="Phân bổ thu nhập" onClick={onOpenIncomeModal} icon={<Wallet className="w-4 h-4" />} tone="emerald" />
            <HeaderAction label="Thêm giao dịch" onClick={onOpenTransactionModal} icon={<PlusCircle className="w-4 h-4" />} tone="indigo" />
            <HeaderAction label="Tài khoản ngân hàng" onClick={onOpenBankAccountsModal} icon={<Landmark className="w-4 h-4" />} />
            <HeaderAction label="Trợ lý AI" onClick={onOpenAIAdvisor} icon={<Sparkles className="w-4 h-4" />} tone="purple" />

            <div className="relative group">
              <button aria-label="Xuất báo cáo" className="w-10 h-10 text-zinc-400 hover:text-white hover:bg-[#1c1c20] bg-[#121214] rounded-xl transition-all border border-zinc-800 flex items-center justify-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/60">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              </button>
              <div className="absolute right-0 mt-2 w-48 bg-[#18181b] rounded-2xl shadow-2xl border border-zinc-800 py-1.5 hidden group-hover:block group-focus-within:block z-50">
                <div className="px-3 py-1 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                  Xuất Báo Cáo
                </div>
                <button
                  onClick={onExportExcel}
                  className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center space-x-2 transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <span>File Excel (.xlsx)</span>
                </button>
                <button
                  onClick={onExportPDF}
                  className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center space-x-2 transition-colors"
                >
                  <Printer className="w-4 h-4 text-sky-400" />
                  <span>In / File PDF</span>
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            className="group relative ml-auto flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-zinc-800 bg-[#1c1c20] text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/60 md:ml-2"
            aria-label={resolvedTheme === 'light' ? 'Chuyển sang giao diện tối' : 'Chuyển sang giao diện sáng'}
          >
            {resolvedTheme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            <HeaderTooltip label={resolvedTheme === 'light' ? 'Giao diện tối' : 'Giao diện sáng'} />
          </button>

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="group relative ml-2 flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-zinc-800 bg-[#1c1c20] text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
            aria-label="Cài đặt hiển thị"
          >
            <Settings2 className="w-4 h-4" />
            <HeaderTooltip label="Cài đặt" />
          </button>

          {onOpenAuthModal && (
            <ProfileAction user={user} onClick={onOpenAuthModal} />
          )}
        </div>

        <div className="relative z-10 mt-2 flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-[#121214] p-2 xl:hidden">
          <HeaderAction label="Phân bổ thu nhập" onClick={onOpenIncomeModal} icon={<Wallet className="w-4 h-4" />} tone="emerald" tooltipPlacement="top" />
          <HeaderAction label="Thêm giao dịch" onClick={onOpenTransactionModal} icon={<PlusCircle className="w-4 h-4" />} tone="indigo" tooltipPlacement="top" />
          <HeaderAction label="Trợ lý AI" onClick={onOpenAIAdvisor} icon={<Bot className="w-4 h-4" />} tone="purple" tooltipPlacement="top" />
          <HeaderAction label="Tài khoản ngân hàng" onClick={onOpenBankAccountsModal} icon={<Landmark className="w-4 h-4" />} tooltipPlacement="top" />
          <HeaderAction label="Xuất Excel" onClick={onExportExcel} icon={<FileSpreadsheet className="w-4 h-4" />} tooltipPlacement="top" />
        </div>

        {/* Mobile Tab bar below navbar */}
        <div className="md:hidden grid grid-cols-4 gap-1 py-1.5 my-2 bg-[#121214] rounded-2xl border border-zinc-800 text-[10px] font-medium px-1.5">
          <button
            onClick={() => setActiveTab('jars')}
            className={`py-1.5 px-1 rounded-lg ${activeTab === 'jars' ? 'bg-indigo-600 text-white font-bold' : 'text-zinc-400'}`}
          >
            Hũ Tài Chính
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`py-1.5 px-1 rounded-lg ${
              activeTab === 'transactions' ? 'bg-indigo-600 text-white font-bold' : 'text-zinc-400'
            }`}
          >
            Chi Tiêu
          </button>
          <button
            onClick={() => setActiveTab('crypto')}
            className={`py-1.5 px-1 rounded-lg ${
              activeTab === 'crypto' ? 'bg-amber-500 text-zinc-950 font-bold' : 'text-amber-400'
            }`}
          >
            Đầu Tư
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`py-1.5 px-1 rounded-lg ${
              activeTab === 'analytics' ? 'bg-indigo-600 text-white font-bold' : 'text-zinc-400'
            }`}
          >
            Thống Kê
          </button>
        </div>
      </div>

      {isSettingsOpen && createPortal(
        <div
          className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsSettingsOpen(false);
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="display-settings-title" className="w-full max-w-md max-h-[calc(100dvh-2rem)] bg-[#18181b] border border-zinc-800 rounded-3xl shadow-2xl text-zinc-100 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-[#121214]">
              <div>
                <h2 id="display-settings-title" className="text-base font-black text-white">Cài đặt ứng dụng</h2>
                <p className="text-[11px] text-zinc-400 mt-0.5">Chu kỳ tài chính, ngôn ngữ và giao diện</p>
              </div>
              <button ref={settingsCloseRef} aria-label="Đóng cài đặt" onClick={() => setIsSettingsOpen(false)} className="p-2 rounded-xl text-zinc-400 hover:bg-zinc-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/60 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto overscroll-contain">
              <SettingChoice
                label="Ngôn ngữ / Language"
                options={[['vi', 'Tiếng Việt'], ['en', 'English']]}
                value={preferences.language}
                onChange={(language) => onPreferencesChange({ ...preferences, language: language as 'vi' | 'en' })}
              />
              <SettingChoice
                label="Tiền tệ / Currency"
                options={[['VND', 'VND (₫)'], ['USD', 'USD ($)']]}
                value={preferences.currency}
                onChange={(currency) => onPreferencesChange({ ...preferences, currency: currency as 'VND' | 'USD' })}
              />
              {preferences.currency === 'USD' && (
                <label className="block">
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Tỷ giá quy đổi</span>
                  <div className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-[#121214] px-3">
                    <span className="text-xs text-zinc-400">1 USD =</span>
                    <input
                      type="number"
                      min="1"
                      value={preferences.usdVndRate}
                      onChange={(event) => onPreferencesChange({
                        ...preferences,
                        usdVndRate: Math.max(1, Number(event.target.value) || 26000),
                      })}
                      className="min-w-0 flex-1 py-3 bg-transparent text-right text-sm font-mono font-bold text-white outline-none"
                    />
                    <span className="text-xs text-zinc-400">VND</span>
                  </div>
                </label>
              )}
              <SettingChoice
                label="Giao diện / Appearance"
                options={[['dark', 'Tối'], ['light', 'Sáng'], ['system', 'Tự động']]}
                value={preferences.theme}
                onChange={(theme) => onPreferencesChange({ ...preferences, theme: theme as 'dark' | 'light' | 'system' })}
              />
              <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/10 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
                    <CalendarClock className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <label htmlFor="monthly-reset-day" className="block text-xs font-black text-white">
                      Ngày bắt đầu chu kỳ hàng tháng
                    </label>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                      Chi tiêu chu kỳ cũ sẽ được tổng kết; phần tiền chưa dùng trong mỗi hũ được giữ lại và cộng với phân bổ kỳ mới.
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-xs font-semibold text-zinc-400">Ngày</span>
                      <input
                        id="monthly-reset-day"
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max="31"
                        value={resetDayDraft}
                        onChange={(event) => setResetDayDraft(
                          event.target.value.replace(/\D/g, '').slice(0, 2)
                        )}
                        className="w-20 rounded-xl border border-zinc-700 bg-[#121214] px-3 py-2 text-center font-mono text-sm font-black text-white outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                      <span className="text-[11px] text-zinc-500">mỗi tháng</span>
                    </div>
                    <p className="mt-3 text-[11px] font-semibold text-indigo-200">
                      Lần reset tiếp theo: {formatCycleDate(nextResetDate, preferences.language)}
                    </p>
                    <p className="mt-1 text-[10px] text-zinc-500">
                      Tháng không có ngày đã chọn sẽ dùng ngày cuối tháng. Đổi ngày chỉ áp dụng lại ranh giới chu kỳ, không tự chuyển tiền.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 pb-5 pt-1 shrink-0">
              <button
                onClick={() => {
                  if (draftResetDay !== preferences.monthlyResetDay) {
                    onPreferencesChange({ ...preferences, monthlyResetDay: draftResetDay });
                  }
                  setIsSettingsOpen(false);
                }}
                className="w-full cursor-pointer py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400/70"
              >
                Hoàn tất
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </header>
  );
};

const SettingChoice = ({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[][];
  value: string;
  onChange: (value: string) => void;
}) => (
  <div>
    <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">{label}</div>
    <div className={`grid gap-2 ${options.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {options.map(([optionValue, optionLabel]) => (
        <button
          key={optionValue}
          type="button"
          onClick={() => onChange(optionValue)}
          className={`cursor-pointer py-2.5 px-2 rounded-xl border text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/60 ${
            value === optionValue
              ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/20'
              : 'bg-[#121214] border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white'
          }`}
        >
          {optionLabel}
        </button>
      ))}
    </div>
  </div>
);

const HeaderTooltip = ({
  label,
  placement = 'bottom',
}: {
  label: string;
  placement?: 'top' | 'bottom';
}) => (
  <span
    role="tooltip"
    data-ui="header-tooltip"
    className={`pointer-events-none absolute left-1/2 z-[90] -translate-x-1/2 whitespace-nowrap rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-[10px] font-semibold text-white opacity-0 shadow-xl transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 ${placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}`}
  >
    {label}
  </span>
);

const HeaderAction = ({
  label,
  onClick,
  icon,
  tone = 'neutral',
  tooltipPlacement = 'bottom',
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  tone?: 'neutral' | 'emerald' | 'indigo' | 'amber' | 'purple';
  tooltipPlacement?: 'top' | 'bottom';
}) => {
  const toneClasses = {
    neutral: 'border-zinc-800 bg-[#1c1c20] text-zinc-400 hover:border-zinc-700 hover:text-white',
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20',
    indigo: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20',
    purple: 'border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`group relative w-10 h-10 shrink-0 rounded-xl border flex items-center justify-center cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 ${toneClasses[tone]}`}
    >
      {icon}
      <HeaderTooltip label={label} placement={tooltipPlacement} />
    </button>
  );
};

const getProfileInitials = (displayName?: string) =>
  (displayName || 'RoFinance')
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0]?.toLocaleUpperCase('vi-VN'))
    .join('');

const ProfileAction = ({
  user,
  onClick,
}: {
  user?: AuthUser | null;
  onClick: () => void;
}) => {
  const label = user ? `Hồ sơ của ${user.displayName}` : 'Tài khoản';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="group relative ml-2 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 transition-colors hover:bg-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 xl:w-auto xl:max-w-40 xl:justify-start xl:gap-2 xl:px-1.5 xl:pr-3"
    >
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-emerald-500/15 text-[10px] font-black">
        <span aria-hidden="true">{getProfileInitials(user?.displayName)}</span>
        {user?.avatarUrl && (
          <img
            key={user.avatarUrl}
            src={user.avatarUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            onLoad={(event) => { event.currentTarget.style.display = 'block'; }}
            onError={(event) => { event.currentTarget.style.display = 'none'; }}
          />
        )}
      </span>
      <span className="hidden min-w-0 truncate text-[11px] font-bold text-zinc-200 xl:block">
          {user ? <span data-no-translate="true">{user.displayName}</span> : 'Tài khoản'}
      </span>
      <HeaderTooltip label={label} />
    </button>
  );
};
