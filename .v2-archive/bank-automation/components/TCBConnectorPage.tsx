import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clipboard,
  Download,
  ExternalLink,
  KeyRound,
  Landmark,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { formatVND } from '../utils/formatters';

interface ImportedTCBTransaction {
  external_id: string;
  direction: 'CRDT' | 'DBIT';
  amount: number;
  currency: string;
  booking_date?: string;
  creation_time?: string;
  description?: string;
  running_balance?: number | null;
  state?: string;
}

interface ConnectorStatus {
  connected: boolean;
  transactionCount: number;
  connector: null | {
    created_at: string;
    last_synced_at?: string | null;
    last_error?: string | null;
  };
  transactions: ImportedTCBTransaction[];
}

async function connectorRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Không thể xử lý yêu cầu kết nối');
  return data as T;
}

export const TCBConnectorPage: React.FC = () => {
  const [status, setStatus] = useState<ConnectorStatus | null>(null);
  const [pairingKey, setPairingKey] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await connectorRequest<ConnectorStatus>('/api/tcb/connector'));
      setMessage('');
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    const eventSource = new EventSource('/api/tcb/events');
    eventSource.addEventListener('tcb-sync', loadStatus);
    const fallbackTimer = window.setInterval(loadStatus, 30_000);
    return () => {
      eventSource.close();
      window.clearInterval(fallbackTimer);
    };
  }, [loadStatus]);

  const createPairingKey = async () => {
    setIsCreating(true);
    try {
      const result = await connectorRequest<{ token: string }>('/api/tcb/connector', { method: 'POST' });
      setPairingKey(result.token);
      setMessage('Khóa mới đã được tạo. Khóa cũ, nếu có, đã bị thu hồi.');
      await loadStatus();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setIsCreating(false);
    }
  };

  const revokeConnector = async () => {
    if (!window.confirm('Thu hồi kết nối Techcombank trên thiết bị local?')) return;
    await connectorRequest('/api/tcb/connector', { method: 'DELETE' });
    setPairingKey('');
    await loadStatus();
  };

  const copyKey = async () => {
    await navigator.clipboard.writeText(pairingKey);
    setMessage('Đã sao chép khóa ghép nối.');
  };

  const latestBalance = status?.transactions.find((item) => item.running_balance != null)?.running_balance;

  return (
    <main className="min-h-screen bg-[#09090b] px-3 py-5 text-zinc-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <a href="/" className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-[#121214] px-3 py-2 text-xs font-bold text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Về RoFinance
          </a>
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${status?.connected ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-zinc-700 bg-zinc-900 text-zinc-400'}`}>
            <span className={`h-2 w-2 rounded-full ${status?.connected ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            {status?.connected ? 'Đã tạo kết nối' : 'Chưa kết nối'}
          </div>
        </div>

        <section className="overflow-hidden rounded-[28px] border border-zinc-800 bg-[#121214] shadow-2xl">
          <div className="border-b border-zinc-800 p-5 sm:p-7">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-red-400"><Landmark className="h-6 w-6" /></div>
              <div>
                <h1 className="text-xl font-black text-white sm:text-2xl">Techcombank Local Sync</h1>
                <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-zinc-400 sm:text-sm">
                  Đăng nhập trực tiếp trên website Techcombank. RoFinance không nhận mật khẩu, OTP, cookie hoặc access token ngân hàng.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-5 sm:p-7 lg:grid-cols-3">
            <Step number="1" title="Tải tiện ích" description="Tải và giải nén tiện ích Chrome local.">
              <a href="/tcb-sync-extension-v0.4.zip" download className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-indigo-500">
                <Download className="h-4 w-4" /> Tải tiện ích v0.4
              </a>
            </Step>
            <Step number="2" title="Ghép nối thiết bị" description="Tạo khóa rồi nhập vào popup của tiện ích.">
              <button type="button" onClick={createPairingKey} disabled={isCreating} className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50">
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                {status?.connected ? 'Tạo lại khóa' : 'Tạo khóa ghép nối'}
              </button>
            </Step>
            <Step number="3" title="Đăng nhập & đồng bộ" description="Mở website chính thức, đăng nhập và vào lịch sử giao dịch.">
              <a href="https://onlinebanking.techcombank.com.vn/" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs font-bold text-red-300 transition-colors hover:bg-red-500/20">
                <ExternalLink className="h-4 w-4" /> Mở Techcombank
              </a>
            </Step>
          </div>
        </section>

        {pairingKey && (
          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-black text-amber-300">Khóa chỉ hiển thị một lần</h2>
                <p className="mt-1 text-xs text-zinc-300">Không chia sẻ khóa này. Bạn có thể thu hồi và tạo lại bất kỳ lúc nào.</p>
                <div className="mt-3 flex gap-2">
                  <code className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-200">{pairingKey}</code>
                  <button type="button" onClick={copyKey} aria-label="Sao chép khóa" className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-amber-500 text-zinc-950 transition-colors hover:bg-amber-400"><Clipboard className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          </section>
        )}

        {message && <div className="rounded-xl border border-zinc-800 bg-[#121214] px-4 py-3 text-xs text-zinc-300">{message}</div>}

        <section className="grid gap-4 sm:grid-cols-3">
          <StatusCard label="Lần đồng bộ gần nhất" value={status?.connector?.last_synced_at ? new Date(status.connector.last_synced_at).toLocaleString('vi-VN') : 'Chưa đồng bộ'} />
          <StatusCard label="Giao dịch đã nhận" value={String(status?.transactionCount || 0)} />
          <StatusCard label="Số dư gần nhất" value={latestBalance == null ? 'Chưa có dữ liệu' : formatVND(latestBalance)} />
        </section>

        <section className="rounded-[24px] border border-zinc-800 bg-[#121214] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-white">Dữ liệu thử nghiệm gần đây</h2>
              <p className="mt-1 text-xs text-zinc-400">Giao dịch hợp lệ được tự động đồng bộ sang tab Chi tiêu; hạn mức các hũ không bị thay đổi.</p>
            </div>
            <button type="button" onClick={loadStatus} aria-label="Làm mới" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-zinc-700 text-zinc-400 transition-colors hover:text-white"><RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /></button>
          </div>
          {status?.transactions.length ? (
            <div className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800">
              {status.transactions.map((item) => (
                <div key={item.external_id} className="grid gap-2 bg-[#18181b] p-3.5 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0"><div className="truncate text-xs font-bold text-white">{item.description || 'Giao dịch Techcombank'}</div><div className="mt-1 text-[11px] text-zinc-500">{item.booking_date || 'Không rõ ngày'} · {item.state || 'Không rõ trạng thái'}</div></div>
                  <div className={`font-mono text-sm font-black ${item.direction === 'CRDT' ? 'text-emerald-400' : 'text-rose-400'}`}>{item.direction === 'CRDT' ? '+' : '-'}{formatVND(item.amount)}</div>
                </div>
              ))}
            </div>
          ) : <div className="rounded-2xl border border-dashed border-zinc-700 p-8 text-center text-xs text-zinc-500">Chưa nhận được dữ liệu. Hãy cài tiện ích, đăng nhập Techcombank rồi bấm “Bắt đầu đồng bộ”.</div>}
          {status?.connected && <button type="button" onClick={revokeConnector} className="mt-4 inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-rose-400 transition-colors hover:text-rose-300"><Trash2 className="h-4 w-4" /> Thu hồi kết nối</button>}
        </section>
      </div>
    </main>
  );
};

const Step: React.FC<{ number: string; title: string; description: string; children: React.ReactNode }> = ({ number, title, description, children }) => <article className="rounded-2xl border border-zinc-800 bg-[#18181b] p-4"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-zinc-800 text-[11px] font-black text-white">{number}</span><h2 className="text-sm font-black text-white">{title}</h2></div><p className="mt-2 text-xs leading-relaxed text-zinc-400">{description}</p>{children}</article>;

const StatusCard: React.FC<{ label: string; value: string }> = ({ label, value }) => <article className="rounded-2xl border border-zinc-800 bg-[#121214] p-4"><div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />{label}</div><div className="mt-2 break-words text-sm font-black text-white">{value}</div></article>;
