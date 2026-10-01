import React, { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, QrCode, ShieldCheck, X } from 'lucide-react';
import { Jar } from '../types';
import { CurrencyInput } from './CurrencyInput';
import { createVietQRPayload } from '../utils/vietqrPayload';

interface ReceiveQRModalProps { jar: Jar | null; onClose: () => void; isAmountsHidden?: boolean }

export const ReceiveQRModal: React.FC<ReceiveQRModalProps> = ({ jar, onClose, isAmountsHidden = false }) => {
  const [amount, setAmount] = useState<number | ''>('');
  const [purpose, setPurpose] = useState('');
  const payload = useMemo(() => jar ? createVietQRPayload({ bankCode: jar.bankCode, accountNumber: jar.accountNumber, accountName: jar.accountName, amount: amount || 0, purpose }) : '', [amount, jar, purpose]);
  if (!jar) return null;

  const downloadQR = () => {
    const svg = document.getElementById('receive-vietqr-code');
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `RoFinance-${jar.code}-${jar.accountNumber}.svg`; link.click();
    URL.revokeObjectURL(url);
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-3 sm:p-5">
    <div className="my-auto w-full max-w-md overflow-hidden rounded-[28px] border border-zinc-800 bg-[#18181b] text-zinc-100 shadow-2xl">
      <header className="flex items-start justify-between border-b border-zinc-800 bg-[#121214] p-5">
        <div className="flex gap-3"><div className="rounded-2xl bg-indigo-500/10 p-2.5 text-indigo-400"><QrCode className="h-5 w-5" /></div><div><h2 className="font-black text-white">QR Nhận Tiền Vào Hũ</h2><p className="mt-1 text-xs text-zinc-400">{jar.name} · {jar.bankName}</p></div></div>
        <button type="button" onClick={onClose} aria-label="Đóng" className="cursor-pointer rounded-xl p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"><X className="h-5 w-5" /></button>
      </header>
      <div className="space-y-4 p-5">
        <div className="mx-auto w-fit rounded-3xl bg-white p-4 shadow-xl"><QRCodeSVG id="receive-vietqr-code" value={payload} size={240} level="M" includeMargin={false} /></div>
        <div className="rounded-2xl border border-zinc-800 bg-[#121214] p-3 text-center"><div className="text-sm font-black text-white">{jar.accountName ? <span data-no-translate="true">{jar.accountName}</span> : 'Tên được ngân hàng xác minh khi quét'}</div><div className="mt-1 font-mono text-xs text-zinc-400">{jar.accountNumber} · {jar.bankName}</div></div>
        <label className="block space-y-1.5 text-xs font-bold text-zinc-300"><span>Số tiền tùy chọn</span><CurrencyInput value={amount} onValueChange={setAmount} min={0} hideAmount={isAmountsHidden} className="w-full rounded-xl border border-zinc-700 bg-[#121214] px-3 py-2.5 text-right font-mono font-bold text-white outline-none focus:border-indigo-500" /></label>
        <label className="block space-y-1.5 text-xs font-bold text-zinc-300"><span>Nội dung tùy chọn</span><input value={purpose} onChange={(event) => setPurpose(event.target.value.slice(0, 25))} placeholder={`NAP TIEN HU ${jar.code}`} className="w-full rounded-xl border border-zinc-700 bg-[#121214] px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500" /></label>
        <div className="flex gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs leading-relaxed text-emerald-200"><ShieldCheck className="h-4 w-4 shrink-0" />QR chỉ chứa thông tin nhận tiền. RoFinance không kết nối ngân hàng và không tự ghi giao dịch.</div>
        <button type="button" onClick={downloadQR} className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 py-2.5 text-xs font-black text-zinc-200 hover:bg-zinc-800"><Download className="h-4 w-4" />Tải QR dạng SVG</button>
      </div>
    </div>
  </div>;
};
