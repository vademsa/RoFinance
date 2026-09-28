import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QrScanner from 'qr-scanner';
import { ArrowLeftRight, Camera, CheckCircle2, ExternalLink, QrCode, ShieldCheck, X } from 'lucide-react';
import { Jar, Transaction } from '../types';
import { CATEGORIES_BY_JAR_CODE } from '../constants/defaultData';
import { CurrencyInput } from './CurrencyInput';
import { formatVND } from '../utils/formatters';

interface VietQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  jars: Jar[];
  initialJarId?: string | null;
  onAddTransaction: (transaction: Omit<Transaction, 'id'>) => void;
}

type Bank = { bin: string; code: string; shortName: string; lookupSupported?: boolean };

const PENDING_PAYMENT_KEY = 'rof_pending_payment';
const APP_IDS: Record<string, string> = {
  TCB: 'tcb', VCB: 'vcb', MB: 'mb', BIDV: 'bidv', ACB: 'acb', CTG: 'icb',
  VPB: 'vpbank', TPB: 'tpbank', VIB: 'vib', OCB: 'ocb', MSB: 'msb', STB: 'stb',
};

function parseTLV(value: string) {
  const fields = new Map<string, string>();
  let offset = 0;
  while (offset + 4 <= value.length) {
    const tag = value.slice(offset, offset + 2);
    const length = Number(value.slice(offset + 2, offset + 4));
    if (!Number.isInteger(length) || length < 0 || offset + 4 + length > value.length) break;
    fields.set(tag, value.slice(offset + 4, offset + 4 + length));
    offset += 4 + length;
  }
  return fields;
}

function parseVietQR(raw: string) {
  const root = parseTLV(raw.trim());
  const merchantValue = Array.from(root.entries())
    .filter(([tag]) => Number(tag) >= 26 && Number(tag) <= 51)
    .map(([, value]) => value)
    .find((value) => value.includes('A000000727')) || root.get('38') || '';
  const merchant = parseTLV(merchantValue);
  const consumer = parseTLV(merchant.get('01') || '');
  const additional = parseTLV(root.get('62') || '');
  const bankBin = consumer.get('00') || '';
  const accountNumber = consumer.get('01') || '';
  if (!bankBin || !accountNumber) throw new Error('QR này không chứa tài khoản VietQR hợp lệ.');
  return {
    bankBin,
    accountNumber,
    accountName: root.get('59') || '',
    amount: Number(root.get('54') || 0),
    memo: additional.get('08') || additional.get('05') || '',
  };
}

const inputClass = 'w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

export const VietQRModal: React.FC<VietQRModalProps> = ({
  isOpen, onClose, jars, initialJarId, onAddTransaction,
}) => {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [jarId, setJarId] = useState(jars[0]?.id || '');
  const [recipientBankCode, setRecipientBankCode] = useState('');
  const [recipientAccount, setRecipientAccount] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [category, setCategory] = useState('Khác');
  const [memo, setMemo] = useState('');
  const [scanError, setScanError] = useState('');
  const [scanSuccess, setScanSuccess] = useState('');
  const [lookupNotice, setLookupNotice] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);

  const selectedJar = jars.find((jar) => jar.id === jarId) || jars[0];
  const categories = CATEGORIES_BY_JAR_CODE[selectedJar?.code] || ['Khác'];
  const recipientBank = banks.find((bank) => bank.code === recipientBankCode);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/vietqr/banks').then((response) => response.json()).then((data) => setBanks(data.banks || [])).catch(() => undefined);
    const pending = localStorage.getItem(PENDING_PAYMENT_KEY);
    if (pending) {
      try {
        const value = JSON.parse(pending);
        setJarId(value.jarId || jars[0]?.id || '');
        setRecipientBankCode(value.recipientBankCode || '');
        setRecipientAccount(value.recipientAccount || '');
        setRecipientName(value.recipientName || '');
        setAmount(value.amount || '');
        setCategory(value.category || 'Khác');
        setMemo(value.memo || '');
        setAwaitingConfirmation(true);
        return;
      } catch { localStorage.removeItem(PENDING_PAYMENT_KEY); }
    }
    const nextJar = jars.find((jar) => jar.id === initialJarId) || jars[0];
    if (nextJar) {
      setJarId(nextJar.id);
      setCategory((CATEGORIES_BY_JAR_CODE[nextJar.code] || ['Khác'])[0]);
    }
  }, [initialJarId, isOpen, jars]);

  useEffect(() => {
    if (!selectedJar || awaitingConfirmation) return;
    const nextCategories = CATEGORIES_BY_JAR_CODE[selectedJar.code] || ['Khác'];
    if (!nextCategories.includes(category)) setCategory(nextCategories[0]);
  }, [awaitingConfirmation, category, selectedJar]);

  const applyDecodedQR = useCallback(async (raw: string) => {
    const parsed = parseVietQR(raw);
    let availableBanks = banks;
    if (!availableBanks.length || !availableBanks.some((item) => item.bin === parsed.bankBin)) {
      const response = await fetch('/api/vietqr/banks');
      if (!response.ok) throw new Error('Không tải được danh sách ngân hàng để nhận diện QR.');
      const data = await response.json();
      availableBanks = data.banks || [];
      setBanks(availableBanks);
    }
    const bank = availableBanks.find((item) => item.bin === parsed.bankBin);
    if (!bank) throw new Error(`Chưa nhận diện được ngân hàng BIN ${parsed.bankBin}.`);
    let accountName = parsed.accountName;
    setLookupNotice('');
    if (bank.lookupSupported !== false) {
      try {
        const lookupResponse = await fetch('/api/vietqr/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bin: parsed.bankBin, accountNumber: parsed.accountNumber }),
        });
        const lookupData = await lookupResponse.json().catch(() => ({}));
        if (!lookupResponse.ok || !lookupData.accountName) {
          throw new Error(lookupData.error || 'VietQR không trả về tên tài khoản.');
        }
        accountName = lookupData.accountName;
      } catch (error: any) {
        setLookupNotice(`Không thể tự lấy tên người nhận: ${error.message || 'VietQR Lookup không khả dụng'}`);
      }
    } else {
      setLookupNotice(`${bank.shortName} hiện không hỗ trợ tra cứu tên qua VietQR Lookup.`);
    }
    setRecipientBankCode(bank.code);
    setRecipientAccount(parsed.accountNumber);
    setRecipientName(accountName);
    if (parsed.amount > 0) setAmount(parsed.amount);
    if (parsed.memo) setMemo(parsed.memo);
    setScanError('');
    setScanSuccess(`Đã nhận diện ${bank.shortName} · ${parsed.accountNumber}${accountName ? ` · ${accountName}` : ''}`);
    setIsCameraOpen(false);
  }, [banks]);

  useEffect(() => {
    if (!isOpen || !isCameraOpen || !videoRef.current) return;
    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        scanner.stop();
        setIsScanning(true);
        void applyDecodedQR(result.data)
          .catch((error: any) => {
            setScanError(error.message || 'Không đọc được mã QR VietQR.');
            setIsCameraOpen(false);
          })
          .finally(() => setIsScanning(false));
      },
      {
        preferredCamera: 'environment',
        highlightScanRegion: true,
        highlightCodeOutline: true,
        maxScansPerSecond: 10,
      }
    );
    scannerRef.current = scanner;
    scanner.start().catch(() => {
      setScanError('Không thể mở camera. Hãy kiểm tra quyền camera hoặc chọn ảnh QR.');
      setIsCameraOpen(false);
    });
    return () => {
      scanner.destroy();
      scannerRef.current = null;
    };
  }, [applyDecodedQR, isCameraOpen, isOpen]);

  const deepLink = useMemo(() => {
    if (!selectedJar || !recipientAccount || !recipientBankCode || !amount) return '';
    const params = new URLSearchParams({
      app: APP_IDS[selectedJar.bankCode] || selectedJar.bankCode.toLowerCase(),
      ba: `${recipientAccount}@${recipientBankCode.toLowerCase()}`,
      am: String(Math.round(amount)),
      tn: memo || category,
      bn: recipientName,
      url: 'https://rof.aprwatch.com',
    });
    return `https://dl.vietqr.io/pay?${params.toString()}`;
  }, [amount, category, memo, recipientAccount, recipientBankCode, recipientName, selectedJar]);

  if (!isOpen) return null;

  const scanImage = async (file?: File) => {
    if (!file) return;
    setIsScanning(true);
    setScanError('');
    try {
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
      await applyDecodedQR(result.data);
    } catch (error: any) {
      setScanError(error.message || 'Không đọc được mã QR.');
    } finally {
      setIsScanning(false);
    }
  };

  const openBankApp = () => {
    if (!deepLink || !selectedJar || !amount) return;
    localStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify({
      jarId, recipientBankCode, recipientAccount, recipientName, amount, category, memo,
    }));
    setAwaitingConfirmation(true);
    window.location.href = deepLink;
  };

  const confirmPayment = () => {
    if (!selectedJar || !amount) return;
    onAddTransaction({
      type: 'expense', amount, jarId: selectedJar.id, category,
      date: new Date().toISOString().slice(0, 10),
      description: memo || `Chuyển khoản tới ${recipientName || recipientAccount}`,
      bankName: selectedJar.bankName,
      sourceAccountNumber: selectedJar.accountNumber,
      recipientAccount,
      recipientBank: recipientBank?.shortName || recipientBankCode,
    });
    localStorage.removeItem(PENDING_PAYMENT_KEY);
    setAwaitingConfirmation(false);
    setAmount(''); setMemo(''); setRecipientAccount(''); setRecipientName(''); setRecipientBankCode('');
    onClose();
  };

  const cancelPending = () => {
    localStorage.removeItem(PENDING_PAYMENT_KEY);
    setAwaitingConfirmation(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-3 sm:p-5">
      <div className="my-auto w-full max-w-2xl overflow-hidden rounded-[28px] border border-zinc-800 bg-[#18181b] text-zinc-100 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-zinc-800 bg-[#121214] p-5">
          <div className="flex gap-3"><div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-2.5 text-amber-400"><QrCode className="h-5 w-5" /></div><div><h2 className="text-lg font-black text-white">Quét QR & chuyển khoản</h2><p className="mt-1 text-xs text-zinc-400">RoFinance không đăng nhập ngân hàng và chỉ ghi chi tiêu sau khi bạn xác nhận.</p></div></div>
          <button type="button" onClick={onClose} className="cursor-pointer rounded-xl p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"><X className="h-5 w-5" /></button>
        </header>

        {awaitingConfirmation ? <div className="space-y-5 p-5 sm:p-6">
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4"><div className="flex items-center gap-2 font-black text-amber-300"><ShieldCheck className="h-5 w-5" />Xác nhận kết quả chuyển khoản</div><p className="mt-2 text-xs leading-relaxed text-zinc-300">Chỉ bấm “Đã chuyển thành công” sau khi ứng dụng ngân hàng báo giao dịch thành công. RoFinance không thể tự kiểm tra trạng thái ngân hàng.</p></div>
          <div className="grid gap-3 rounded-2xl border border-zinc-800 bg-[#121214] p-4 text-xs sm:grid-cols-2"><Info label="Từ hũ" value={`${selectedJar?.code} · ${selectedJar?.bankName}`} /><Info label="Người nhận" value={`${recipientName || 'Chưa có tên'} · ${recipientAccount}`} /><Info label="Số tiền" value={formatVND(Number(amount))} /><Info label="Danh mục" value={category} /></div>
          <div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={cancelPending} className="cursor-pointer rounded-2xl border border-zinc-700 px-4 py-3 text-sm font-bold text-zinc-300 hover:bg-zinc-800">Chưa chuyển / Quay lại</button><button type="button" onClick={confirmPayment} className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-500"><CheckCircle2 className="h-5 w-5" />Đã chuyển thành công</button></div>
        </div> : <div className="space-y-5 p-5 sm:p-6">
          {isCameraOpen ? <div className="relative overflow-hidden rounded-2xl border border-indigo-500/40 bg-black">
            <video ref={videoRef} className="aspect-square max-h-[52vh] w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-4 pb-4 pt-12 text-center text-xs font-bold text-white">Đưa toàn bộ mã QR vào giữa khung hình</div>
            <button type="button" onClick={() => setIsCameraOpen(false)} className="absolute right-3 top-3 cursor-pointer rounded-xl bg-black/70 px-3 py-2 text-xs font-bold text-white">Đóng camera</button>
          </div> : <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => { setScanError(''); setScanSuccess(''); setLookupNotice(''); setIsCameraOpen(true); }} className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-4 text-sm font-bold text-indigo-300 hover:bg-indigo-500/15"><Camera className="h-5 w-5" />Quét QR trực tiếp</button>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-600 bg-zinc-900 px-4 py-4 text-sm font-bold text-zinc-300 hover:bg-zinc-800"><QrCode className="h-5 w-5" />{isScanning ? 'Đang đọc QR...' : 'Chọn ảnh QR'}<input type="file" accept="image/*" className="sr-only" onChange={(event) => scanImage(event.target.files?.[0])} /></label>
          </div>}
          {scanError && <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{scanError} Bạn vẫn có thể nhập tay bên dưới.</div>}
          {scanSuccess && <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300"><CheckCircle2 className="mr-1.5 inline h-4 w-4" />{scanSuccess}. Thông tin đã được điền bên dưới.</div>}
          {lookupNotice && <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{lookupNotice} Bạn có thể nhập tên thủ công.</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Hũ và ngân hàng nguồn"><select value={jarId} onChange={(event) => setJarId(event.target.value)} className={inputClass}>{jars.filter((jar) => jar.accountNumber).map((jar) => <option key={jar.id} value={jar.id}>{jar.code} · {jar.bankName}</option>)}</select></Field>
            <Field label="Danh mục chi tiêu"><select value={category} onChange={(event) => setCategory(event.target.value)} className={inputClass}>{categories.map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="Ngân hàng người nhận"><select value={recipientBankCode} onChange={(event) => setRecipientBankCode(event.target.value)} className={inputClass}><option value="">Chọn ngân hàng</option>{banks.map((bank) => <option key={bank.bin} value={bank.code}>{bank.shortName}</option>)}</select></Field>
            <Field label="Số tài khoản người nhận"><input inputMode="numeric" value={recipientAccount} onChange={(event) => setRecipientAccount(event.target.value.replace(/\D/g, '').slice(0, 19))} className={`${inputClass} font-mono`} /></Field>
            <Field label="Tên người nhận"><input value={recipientName} onChange={(event) => setRecipientName(event.target.value.toUpperCase())} className={inputClass} /></Field>
            <Field label="Số tiền"><CurrencyInput value={amount} onValueChange={setAmount} min={1} className={`${inputClass} text-right font-mono font-black`} /></Field>
            <div className="sm:col-span-2"><Field label="Nội dung chuyển khoản"><input value={memo} onChange={(event) => setMemo(event.target.value.slice(0, 40))} placeholder="Ví dụ: Thanh toán ăn trưa" className={inputClass} /></Field></div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-[#121214] px-3 py-2 text-[11px] text-zinc-400"><ArrowLeftRight className="mr-1.5 inline h-4 w-4 text-amber-400" />Ứng dụng nguồn: <strong className="text-white">{selectedJar?.bankName || '-'}</strong>. Một số ngân hàng chỉ mở app và chưa tự điền toàn bộ thông tin.</div>
          <button type="button" onClick={openBankApp} disabled={!deepLink} className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3.5 text-sm font-black text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"><ExternalLink className="h-5 w-5" />Mở ứng dụng {selectedJar?.bankName || 'ngân hàng'}</button>
        </div>}
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="block space-y-1.5 text-xs font-bold text-zinc-300"><span>{label}</span>{children}</label>;
const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => <div><div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</div><div className="mt-1 break-words font-bold text-white">{value}</div></div>;
