import React, { useEffect, useMemo, useState } from 'react';
import { Check, History, LayoutTemplate, ShieldCheck, X } from 'lucide-react';
import { CUSTOM_JAR_PLAN_ID, JAR_PLAN_DEFINITIONS } from '../constants/jarPlans';
import type { Jar, JarPlanSnapshot } from '../types';

interface JarPlanSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePlanId: string;
  currentJars: Jar[];
  snapshots: JarPlanSnapshot[];
  hasActiveDebt: boolean;
  onApply: (selection: { planId?: string; snapshotId?: string }) => void;
}

export function JarPlanSelectorModal({
  isOpen,
  onClose,
  activePlanId,
  currentJars,
  snapshots,
  hasActiveDebt,
  onApply,
}: JarPlanSelectorModalProps) {
  const initialSelection = activePlanId === CUSTOM_JAR_PLAN_ID
    ? 'current'
    : activePlanId.startsWith('snapshot-')
    ? activePlanId
    : `plan-${activePlanId}`;
  const [selection, setSelection] = useState(initialSelection);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelection(initialSelection);
    setConfirming(false);
  }, [initialSelection, isOpen]);

  const selectedPlan = JAR_PLAN_DEFINITIONS.find((plan) => `plan-${plan.id}` === selection);
  const selectedSnapshot = snapshots.find((snapshot) => `snapshot-${snapshot.id}` === selection);
  const currentPlan = JAR_PLAN_DEFINITIONS.find((plan) => plan.id === activePlanId);
  const currentSnapshot = snapshots.find((snapshot) => `snapshot-${snapshot.id}` === activePlanId);
  const currentSetupName = activePlanId === CUSTOM_JAR_PLAN_ID
    ? 'Cấu hình tùy chỉnh hiện tại'
    : currentPlan?.name || currentSnapshot?.name || 'Thiết lập hiện tại';
  const allocations = selectedPlan?.allocations || selectedSnapshot?.jars.map((jar) => ({
    code: jar.code,
    percentage: jar.percentage,
  })) || [];
  const selectedHasNoDebtJar = allocations.length > 0 && !allocations.some((item) => item.code === 'DEBT');
  const sortedSnapshots = useMemo(
    () => [...snapshots].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [snapshots],
  );

  if (!isOpen) return null;

  const applySelection = () => {
    if (selectedPlan) onApply({ planId: selectedPlan.id });
    else if (selectedSnapshot) onApply({ snapshotId: selectedSnapshot.id });
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center overflow-y-auto bg-black/75 p-3 backdrop-blur-sm sm:p-6">
      <div role="dialog" aria-modal="true" aria-labelledby="jar-plan-title" className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-zinc-800 bg-[#18181b] text-zinc-100 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-zinc-800 bg-[#121214] px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-500/25 bg-indigo-500/10 text-indigo-300">
              <LayoutTemplate className="h-5 w-5" />
            </span>
            <div>
              <h2 id="jar-plan-title" className="text-base font-black text-white sm:text-lg">Chọn kiểu phân bổ hũ</h2>
              <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-zinc-400 sm:text-xs">
                Hũ còn dùng tiếp sẽ giữ nguyên tiền. Hũ bị loại khỏi mẫu sẽ được lưu trữ và toàn bộ tiền chưa chi được chuyển sang các hũ mới.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng chọn kiểu phân bổ" className="cursor-pointer rounded-xl p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/60">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="overflow-y-auto overscroll-contain p-4 sm:p-6">
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-[11px] leading-relaxed text-emerald-200 sm:text-xs">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Cấu hình hiện tại luôn được lưu thành một bản riêng trước khi đổi. Khi quay lại, hệ thống chỉ khôi phục cấu trúc và thông tin hũ, không khôi phục số dư cũ lần thứ hai.</p>
          </div>

          <section className="mb-6" aria-labelledby="current-plan-title">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 id="current-plan-title" className="text-xs font-black uppercase tracking-wider text-zinc-300">
                Thiết lập hiện tại
              </h3>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black text-emerald-300">
                Đang sử dụng
              </span>
            </div>
            <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/5 p-4" aria-current="true">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-black text-white">{currentSetupName}</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                    Đây là cấu hình thực tế đang áp dụng cho tài khoản của bạn. Hệ thống sẽ lưu lại cấu hình này trước khi bạn chuyển sang mẫu khác.
                  </p>
                </div>
                <div className="shrink-0 text-[10px] font-bold text-emerald-300">
                  {currentJars.length} hũ · {currentJars.reduce((sum, jar) => sum + jar.percentage, 0).toFixed(2).replace(/\.00$/, '')}%
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {currentJars.map((jar) => (
                  <span key={jar.id} className="rounded-lg border border-zinc-700 bg-[#1c1c20] px-2 py-1 font-mono text-[10px] font-bold text-zinc-300">
                    {jar.code} {jar.percentage}%
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section aria-labelledby="preset-plans-title">
            <h3 id="preset-plans-title" className="mb-3 text-xs font-black uppercase tracking-wider text-zinc-300">Mẫu gợi ý</h3>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {JAR_PLAN_DEFINITIONS.map((plan) => {
                const selected = selection === `plan-${plan.id}`;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => { setSelection(`plan-${plan.id}`); setConfirming(false); }}
                    className={`cursor-pointer rounded-2xl border p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/60 ${selected ? 'border-indigo-500 bg-indigo-500/10' : 'border-zinc-800 bg-[#121214] hover:border-zinc-700'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-black text-white">{plan.name}</div>
                        <div className="mt-1 text-[10px] font-semibold text-indigo-300">{plan.suitableFor}</div>
                      </div>
                      {selected && <Check className="h-4 w-4 shrink-0 text-indigo-300" />}
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">{plan.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {plan.allocations.map((item) => (
                        <span key={item.code} className="rounded-lg border border-zinc-700 bg-[#1c1c20] px-2 py-1 font-mono text-[10px] font-bold text-zinc-300">
                          {item.code} {item.percentage}%
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {sortedSnapshots.length > 0 && (
            <section className="mt-6" aria-labelledby="saved-plans-title">
              <h3 id="saved-plans-title" className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-zinc-300">
                <History className="h-4 w-4 text-cyan-300" /> Cấu hình đã lưu
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {sortedSnapshots.map((snapshot) => {
                  const selected = selection === `snapshot-${snapshot.id}`;
                  return (
                    <button
                      key={snapshot.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => { setSelection(`snapshot-${snapshot.id}`); setConfirming(false); }}
                      className={`cursor-pointer rounded-2xl border p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/60 ${selected ? 'border-cyan-500 bg-cyan-500/10' : 'border-zinc-800 bg-[#121214] hover:border-zinc-700'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-black text-white">{snapshot.name}</div>
                          <div className="mt-1 text-[10px] text-zinc-500">{new Date(snapshot.createdAt).toLocaleString('vi-VN')}</div>
                        </div>
                        {selected && <Check className="h-4 w-4 shrink-0 text-cyan-300" />}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {snapshot.jars.map((jar) => <span key={jar.id} className="font-mono text-[10px] text-zinc-400">{jar.code} {jar.percentage}%</span>)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        <footer className="border-t border-zinc-800 bg-[#121214] p-4 sm:px-6">
          {confirming ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black text-white">Xác nhận áp dụng {selectedPlan?.name || selectedSnapshot?.name}</p>
                <p className="mt-1 text-[10px] text-zinc-400">{allocations.length} hũ · tổng {allocations.reduce((sum, item) => sum + item.percentage, 0)}%</p>
                {hasActiveDebt && selectedHasNoDebtJar && (
                  <p className="mt-1 text-[10px] font-semibold text-amber-300">Bạn đang có khoản nợ hoạt động. Mẫu này không tự dành ngân sách trả nợ.</p>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirming(false)} className="flex-1 cursor-pointer rounded-xl border border-zinc-700 px-4 py-2.5 text-xs font-bold text-zinc-300 hover:bg-zinc-800 sm:flex-none">Quay lại</button>
                <button type="button" onClick={applySelection} className="flex-1 cursor-pointer rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/60 sm:flex-none">Xác nhận chuyển</button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="cursor-pointer rounded-xl border border-zinc-700 px-4 py-2.5 text-xs font-bold text-zinc-300 hover:bg-zinc-800">Hủy</button>
              <button type="button" disabled={!selectedPlan && !selectedSnapshot} onClick={() => setConfirming(true)} className="cursor-pointer rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
                {selection === 'current' ? 'Đang sử dụng' : 'Áp dụng mẫu'}
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
