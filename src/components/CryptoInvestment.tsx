import React, { useState, useEffect, useCallback } from 'react';
import { CryptoAsset, BinanceTicker, Jar } from '../types';
import {
  POPULAR_BINANCE_SYMBOLS,
  DEFAULT_USD_VND_RATE,
} from '../constants/defaultData';
import { formatVND, formatUSD } from '../utils/formatters';
import { getDisplayCurrencyCode } from '../lib/preferences';
import { getRuntimePreferences } from '../lib/preferences';
import { toLocalDateKey } from '../utils/monthlyCycle';
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Plus,
  Trash2,
  Edit2,
  Coins,
  Search,
  Zap,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  ExternalLink,
  X,
  Check,
} from 'lucide-react';

interface CryptoInvestmentProps {
  cryptoAssets: CryptoAsset[];
  onAddCryptoAsset: (asset: Omit<CryptoAsset, 'id'>) => void;
  onUpdateCryptoAsset: (asset: CryptoAsset) => void;
  onDeleteCryptoAsset: (id: string) => void;
  isAmountsHidden: boolean;
  jars: Jar[];
  onMetricsChange?: (metrics: { currentValueVND: number; investedVND: number; pnlVND: number; pnlPercent: number }) => void;
}

interface CryptoSearchResult {
  exchange: 'Binance' | 'OKX' | 'Bybit';
  symbol: string;
  pair: string;
  price: number;
}

export const CryptoInvestment: React.FC<CryptoInvestmentProps> = ({
  cryptoAssets,
  onAddCryptoAsset,
  onUpdateCryptoAsset,
  onDeleteCryptoAsset,
  isAmountsHidden,
  jars,
  onMetricsChange,
}) => {
  const usdVndRate = getRuntimePreferences().usdVndRate || DEFAULT_USD_VND_RATE;
  const [tickers, setTickers] = useState<Record<string, BinanceTicker>>({});
  const [exchangePrices, setExchangePrices] = useState<Record<string, number>>({});
  const [isLoadingPrices, setIsLoadingPrices] = useState<boolean>(false);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [activeSubTab, setActiveSubTab] = useState<'portfolio' | 'market'>('portfolio');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingAsset, setEditingAsset] = useState<CryptoAsset | null>(null);

  // Form Fields
  const [formSymbol, setFormSymbol] = useState<string>('BTC');
  const [formName, setFormName] = useState<string>('Bitcoin');
  const [formAmount, setFormAmount] = useState<string>('1');
  const [formBuyPrice, setFormBuyPrice] = useState<string>('60000');
  const [formLinkedJarCode, setFormLinkedJarCode] = useState<string>('FFA');
  const [formNotes, setFormNotes] = useState<string>('Đầu tư tích sản từ Hũ Tự Do Tài Chính (FFA)');
  const [formExchange, setFormExchange] = useState<'Binance' | 'OKX' | 'Bybit'>('Binance');
  const [formMarketPair, setFormMarketPair] = useState<string>('BTCUSDT');
  const [coinSearch, setCoinSearch] = useState<string>('BTC');
  const [coinSearchResults, setCoinSearchResults] = useState<CryptoSearchResult[]>([]);
  const [isSearchingCoins, setIsSearchingCoins] = useState(false);
  const [coinSearchError, setCoinSearchError] = useState('');

  useEffect(() => {
    if (!isModalOpen || editingAsset || coinSearch.trim().length < 1) {
      setCoinSearchResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSearchingCoins(true);
      setCoinSearchError('');
      try {
        const response = await fetch(`/api/crypto/search?q=${encodeURIComponent(coinSearch.trim())}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Không thể tìm coin');
        setCoinSearchResults(data.items || []);
      } catch (error: any) {
        if (error.name !== 'AbortError') setCoinSearchError(error.message);
      } finally {
        if (!controller.signal.aborted) setIsSearchingCoins(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [coinSearch, editingAsset, isModalOpen]);

  // Fetch prices initial snapshot via REST API
  const fetchBinancePrices = useCallback(async () => {
    setIsLoadingPrices(true);
    try {
      const symbolsToFetch = Array.from(
        new Set([
          ...POPULAR_BINANCE_SYMBOLS.map((s) => s.symbol),
          ...cryptoAssets.map((a) => `${a.symbol.toUpperCase()}USDT`),
        ])
      );

      const res = await fetch(
        `/api/crypto/binance/tickers?symbols=${encodeURIComponent(symbolsToFetch.join(','))}`
      );

      if (res.ok) {
        const payload = await res.json();
        const data: BinanceTicker[] = payload.items || [];
        const tickerMap: Record<string, BinanceTicker> = {};
        data.forEach((t) => {
          tickerMap[t.symbol] = t;
        });
        setTickers((prev) => ({ ...prev, ...tickerMap }));
        setLastUpdated(new Date().toLocaleTimeString('vi-VN'));
        setIsLiveConnected(true);
      } else {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || `RoFinance market API trả về HTTP ${res.status}`);
      }
    } catch (error) {
      setIsLiveConnected(false);
      console.error('Lỗi kết nối RoFinance market API:', error);
    } finally {
      setIsLoadingPrices(false);
    }
  }, [cryptoAssets]);

  // Poll through the RoFinance backend to avoid browser CORS and regional blocks.
  useEffect(() => {
    fetchBinancePrices();
    const pollingInterval = window.setInterval(fetchBinancePrices, 15_000);
    return () => window.clearInterval(pollingInterval);
  }, [fetchBinancePrices]);

  useEffect(() => {
    let active = true;
    const refreshExchangePrices = async () => {
      const symbols = [...new Set(cryptoAssets.map((asset) => asset.symbol.toUpperCase()))];
      const responses = await Promise.allSettled(
        symbols.map(async (symbol) => {
          const response = await fetch(`/api/crypto/search?q=${encodeURIComponent(symbol)}`);
          if (!response.ok) return [];
          const data = await response.json();
          return (data.items || []) as CryptoSearchResult[];
        })
      );
      if (!active) return;
      const nextPrices: Record<string, number> = {};
      responses.forEach((result) => {
        if (result.status !== 'fulfilled') return;
        result.value.forEach((item) => {
          nextPrices[`${item.exchange}:${item.pair}`] = item.price;
        });
      });
      setExchangePrices(nextPrices);
    };
    refreshExchangePrices();
    const interval = window.setInterval(refreshExchangePrices, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [cryptoAssets]);

  const getAssetCurrentPrice = (asset: CryptoAsset) => {
    const exchange = asset.exchange || 'Binance';
    const pair = asset.marketPair || `${asset.symbol.toUpperCase()}USDT`;
    return (
      exchangePrices[`${exchange}:${pair}`] ||
      (tickers[`${asset.symbol.toUpperCase()}USDT`]
        ? parseFloat(tickers[`${asset.symbol.toUpperCase()}USDT`].lastPrice)
        : asset.buyPriceUSD)
    );
  };

  // Calculate portfolio totals
  let totalInvestedUSD = 0;
  let totalCurrentValUSD = 0;

  cryptoAssets.forEach((asset) => {
    const currentPriceUSD = getAssetCurrentPrice(asset);

    totalInvestedUSD += asset.amountHeld * asset.buyPriceUSD;
    totalCurrentValUSD += asset.amountHeld * currentPriceUSD;
  });

  const totalInvestedVND = totalInvestedUSD * usdVndRate;
  const totalCurrentValVND = totalCurrentValUSD * usdVndRate;
  const totalPnLUSD = totalCurrentValUSD - totalInvestedUSD;
  const totalPnLVND = totalPnLUSD * usdVndRate;
  const totalPnLPercent =
    totalInvestedUSD > 0 ? (totalPnLUSD / totalInvestedUSD) * 100 : 0;

  useEffect(() => {
    onMetricsChange?.({
      currentValueVND: totalCurrentValVND,
      investedVND: totalInvestedVND,
      pnlVND: totalPnLVND,
      pnlPercent: totalPnLPercent,
    });
  }, [onMetricsChange, totalCurrentValVND, totalInvestedVND, totalPnLVND, totalPnLPercent]);

  // Open modal for add/edit
  const handleOpenAddModal = (symbolDefault = 'BTC', nameDefault = 'Bitcoin', priceDefault?: string) => {
    setEditingAsset(null);
    setFormSymbol(symbolDefault);
    setFormName(nameDefault);
    setFormAmount('1');
    setFormLinkedJarCode('FFA');
    setFormExchange('Binance');
    setFormMarketPair(`${symbolDefault.toUpperCase()}USDT`);
    setCoinSearch(symbolDefault);

    const liveTicker = tickers[`${symbolDefault.toUpperCase()}USDT`];
    const initialPrice = priceDefault || (liveTicker ? liveTicker.lastPrice : '60000');
    setFormBuyPrice(initialPrice);
    
    const jarObj = jars.find((j) => j.code === 'FFA');
    const jarName = jarObj ? jarObj.name : 'Tự Do Tài Chính';
    setFormNotes(`Đầu tư tích sản từ Hũ ${jarName} (FFA)`);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (asset: CryptoAsset) => {
    setEditingAsset(asset);
    setFormSymbol(asset.symbol);
    setFormName(asset.name);
    setFormAmount(asset.amountHeld.toString());
    setFormBuyPrice(asset.buyPriceUSD.toString());
    setFormLinkedJarCode(asset.linkedJarCode || 'FFA');
    setFormNotes(asset.notes || '');
    setFormExchange(asset.exchange || 'Binance');
    setFormMarketPair(asset.marketPair || `${asset.symbol.toUpperCase()}USDT`);
    setIsModalOpen(true);
  };

  const handleSelectSearchResult = (coin: CryptoSearchResult) => {
    setFormSymbol(coin.symbol);
    setFormName(coin.symbol);
    setFormExchange(coin.exchange);
    setFormMarketPair(coin.pair);
    setFormBuyPrice(String(coin.price));
    setCoinSearch(coin.symbol);
    setCoinSearchResults([]);
  };

  const handleSelectCoin = (coinSymbol: string) => {
    const selectedCoin = POPULAR_BINANCE_SYMBOLS.find((s) => s.coin === coinSymbol);
    if (selectedCoin) {
      setFormSymbol(selectedCoin.coin);
      setFormName(selectedCoin.name);
      const liveTicker = tickers[`${selectedCoin.coin}USDT`];
      if (liveTicker && parseFloat(liveTicker.lastPrice) > 0) {
        setFormBuyPrice(liveTicker.lastPrice);
      }
    } else {
      setFormSymbol(coinSymbol);
    }
  };

  const handleSelectJar = (jarCode: string) => {
    setFormLinkedJarCode(jarCode);
    const selectedJar = jars.find((j) => j.code === jarCode);
    if (selectedJar) {
      setFormNotes(`Đầu tư tích sản từ Hũ ${selectedJar.name} (${selectedJar.code})`);
    }
  };

  const handleFillLivePrice = async () => {
    try {
      const response = await fetch(`/api/crypto/search?q=${encodeURIComponent(formSymbol)}`);
      const data = await response.json();
      const market = (data.items || []).find(
        (item: CryptoSearchResult) =>
          item.exchange === formExchange && item.pair === formMarketPair
      );
      if (!response.ok || !market?.price) throw new Error();
      setFormBuyPrice(String(market.price));
    } catch {
      alert(`Chưa lấy được giá ${formSymbol} trên ${formExchange}. Vui lòng thử lại!`);
    }
  };

  const handleSaveAsset = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(formAmount) || 0;
    const price = parseFloat(formBuyPrice) || 0;

    if (amount <= 0 || price < 0) {
      alert('Số lượng phải lớn hơn 0 và giá mua không được là số âm!');
      return;
    }

    if (editingAsset) {
      onUpdateCryptoAsset({
        ...editingAsset,
        symbol: formSymbol.toUpperCase(),
        name: formName,
        amountHeld: amount,
        buyPriceUSD: price,
        linkedJarCode: formLinkedJarCode,
        notes: formNotes,
        exchange: formExchange,
        marketPair: formMarketPair,
      });
    } else {
      onAddCryptoAsset({
        symbol: formSymbol.toUpperCase(),
        name: formName,
        amountHeld: amount,
        buyPriceUSD: price,
        buyDate: toLocalDateKey(new Date()),
        linkedJarCode: formLinkedJarCode,
        notes: formNotes,
        exchange: formExchange,
        marketPair: formMarketPair,
      });
    }

    setIsModalOpen(false);
  };

  // Filtered market tickers
  const filteredPopularCoins = POPULAR_BINANCE_SYMBOLS.filter(
    (c) =>
      c.coin.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="bg-[#121214] border border-zinc-800 rounded-[32px] p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center shadow-lg shadow-amber-500/20 text-zinc-950 font-black">
              <Coins className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-black text-white tracking-tight">
                  Đầu Tư Tài Sản Số (Crypto Portfolio)
                </h2>
                {isLiveConnected ? (
                  <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>Giá sàn qua RoFinance API</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Zap className="w-3 h-3 animate-pulse text-amber-400" />
                    <span>Đang kết nối API giá</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Theo dõi biến động thị trường & tính lợi nhuận danh mục tài sản mã hóa realtime
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            {/* USD/VND exchange rate config */}
            <div className="flex items-center space-x-2 bg-[#1c1c20] px-3.5 py-2 rounded-2xl border border-zinc-800">
              <span className="text-[11px] font-bold text-zinc-400">1 USDT =</span>
              <input
                type="number"
                value={usdVndRate}
                readOnly
                className="w-20 bg-[#121214] border border-zinc-700 rounded-lg text-center font-mono font-bold text-xs text-amber-400 py-1"
              />
              <span className="text-[11px] font-bold text-zinc-400">VNĐ</span>
            </div>

            <button
              onClick={fetchBinancePrices}
              disabled={isLoadingPrices}
              className="px-3.5 py-2 bg-[#1c1c20] hover:bg-zinc-800 text-zinc-300 text-xs font-bold rounded-2xl border border-zinc-800 transition-all flex items-center space-x-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isLoadingPrices ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Làm Mới</span>
            </button>

            <button
              onClick={() => handleOpenAddModal('BTC', 'Bitcoin', '60000')}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-extrabold text-xs rounded-2xl transition-all shadow-lg shadow-amber-500/20 flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Thêm Tài Sản</span>
            </button>
          </div>
        </div>

        {/* Bento Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {/* Card 1: Total Portfolio Value */}
          <div className="bg-[#18181b] p-5 rounded-2xl border border-zinc-800 sm:col-span-2 lg:col-span-2">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold">
              <span>Tổng Giá Trị Hiện Tại</span>
              <DollarSign className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-3xl font-black font-mono text-white mt-3 sm:text-4xl">
              {formatVND(totalCurrentValVND, isAmountsHidden)}
            </div>
            <div className="mt-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Lãi / lỗ chưa thực hiện</div>
                <div className={`mt-1 font-mono text-sm font-black ${totalPnLUSD >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {totalPnLUSD >= 0 ? '+' : ''}{formatVND(totalPnLVND, isAmountsHidden)} <span className="whitespace-nowrap">({totalPnLUSD >= 0 ? '+' : ''}{totalPnLPercent.toFixed(2)}%)</span>
                </div>
              </div>
            </div>
            <div className="mt-2 text-[11px] font-mono font-bold text-amber-400">≈ {formatUSD(totalCurrentValUSD, isAmountsHidden)}</div>
          </div>

          {/* Card 2: Total Capital Invested */}
          <div className="bg-[#18181b] p-5 rounded-2xl border border-zinc-800">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold">
              <span>Vốn Đầu Tư Ban Đầu</span>
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-black font-mono text-zinc-200 mt-2">
              {formatVND(totalInvestedVND, isAmountsHidden)}
            </div>
            <div className="text-xs font-mono font-semibold text-zinc-400 mt-1">
              ≈ {formatUSD(totalInvestedUSD, isAmountsHidden)}
            </div>
          </div>

          {/* Card 4: Linked FFA Jar Sync Info */}
          <div className="bg-[#18181b] p-5 rounded-2xl border border-zinc-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold">
              <span>Trích Từ Hũ Tự Do Tài Chính</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                FFA Jar
              </span>
            </div>
            <div className="mt-2 text-xs text-zinc-300 leading-relaxed">
              Các tài sản số được tự động kết nối với danh mục đầu tư tích sản thuộc hũ FFA để tối ưu dòng tiền thụ động.
            </div>
            <div className="text-[10px] text-zinc-500 mt-2 font-mono">
              Binance Sync: {lastUpdated ? lastUpdated : 'Đang tải...'}
            </div>
          </div>
        </div>
      </div>

      {/* Sub Tabs: My Portfolio vs Binance Live Market */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div className="flex items-center space-x-2 bg-[#121214] p-1.5 rounded-2xl border border-zinc-800">
          <button
            onClick={() => setActiveSubTab('portfolio')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
              activeSubTab === 'portfolio'
                ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Coins className="w-4 h-4" />
            <span>Danh Mục Đang Nắm Giữ ({cryptoAssets.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('market')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
              activeSubTab === 'market'
                ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>Bảng Giá Binance Realtime</span>
          </button>
        </div>

        {activeSubTab === 'market' && (
          <div className="relative w-64">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm đồng coin..."
              className="w-full pl-9 pr-4 py-2 bg-[#121214] border border-zinc-800 rounded-2xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 transition-all"
            />
          </div>
        )}
      </div>

      {/* SUB-TAB 1: PORTFOLIO HOLDINGS */}
      {activeSubTab === 'portfolio' && (
        <div className="bg-[#121214] border border-zinc-800 rounded-[32px] overflow-hidden shadow-2xl">
          <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">
              Chi Tiết Danh Mục Đầu Tư Tài Sản Mã Hóa
            </h3>
            <button
              onClick={() => handleOpenAddModal('BTC', 'Bitcoin', '60000')}
              className="px-3.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-bold rounded-xl border border-amber-500/20 transition-all flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm Coin Mới</span>
            </button>
          </div>

          {cryptoAssets.length === 0 ? (
            <div className="p-12 text-center text-zinc-500 space-y-3">
              <Coins className="w-12 h-12 mx-auto text-zinc-600" />
              <p className="text-sm font-semibold">Chưa có tài sản số nào trong danh mục</p>
              <button
                onClick={() => handleOpenAddModal('BTC', 'Bitcoin', '60000')}
                className="px-4 py-2 bg-amber-500 text-zinc-950 font-bold text-xs rounded-xl shadow-md"
              >
                + Thêm Coin Đầu Tiên
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#18181b] text-zinc-400 border-b border-zinc-800 uppercase font-mono tracking-wider">
                    <th className="py-3.5 px-6 font-bold">Tài Sản</th>
                    <th className="py-3.5 px-4 font-bold text-right">Số Lượng</th>
                    <th className="py-3.5 px-4 font-bold text-right">Giá Vốn (Entry)</th>
                    <th className="py-3.5 px-4 font-bold text-right">Giá Sàn Live</th>
                    <th className="py-3.5 px-4 font-bold text-right">Giá Trị Hiện Tại ({getDisplayCurrencyCode()})</th>
                    <th className="py-3.5 px-4 font-bold text-right">Lãi / Lỗ (PnL)</th>
                    <th className="py-3.5 px-6 font-bold text-center">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-medium text-zinc-200">
                  {cryptoAssets.map((asset) => {
                    const symbolUSDT = `${asset.symbol.toUpperCase()}USDT`;
                    const ticker = tickers[symbolUSDT];
                    const livePriceUSD = getAssetCurrentPrice(asset);
                    const priceChange24h =
                      (asset.exchange || 'Binance') === 'Binance' && ticker
                        ? parseFloat(ticker.priceChangePercent)
                        : 0;

                    const currentValUSD = asset.amountHeld * livePriceUSD;
                    const currentValVND = currentValUSD * usdVndRate;
                    const pnlUSD = currentValUSD - asset.amountHeld * asset.buyPriceUSD;
                    const pnlVND = pnlUSD * usdVndRate;
                    const pnlPercent =
                      asset.buyPriceUSD > 0
                        ? (pnlUSD / (asset.amountHeld * asset.buyPriceUSD)) * 100
                        : 0;

                    return (
                      <tr key={asset.id} className="hover:bg-[#18181b] transition-colors">
                        <td className="py-4 px-6">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-black text-amber-400 text-xs">
                              {asset.symbol}
                            </div>
                            <div>
                              <div className="font-extrabold text-white text-sm">
                                {asset.name} ({asset.symbol})
                              </div>
                              <div className="text-[10px] text-zinc-400">
                                Hũ: {asset.linkedJarCode || 'FFA'} • {asset.notes || 'Tích sản'}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-4 px-4 text-right font-mono font-bold text-white">
                          {asset.amountHeld} {asset.symbol}
                        </td>

                        <td className="py-4 px-4 text-right font-mono text-zinc-400">
                          {asset.buyPriceUSD === 0 ? (
                            <span className="inline-flex rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-[10px] font-bold text-sky-400">
                              Airdrop · $0
                            </span>
                          ) : (
                            formatUSD(asset.buyPriceUSD, isAmountsHidden)
                          )}
                        </td>

                        <td className="py-4 px-4 text-right font-mono">
                          <div className="font-bold text-amber-400">
                            {formatUSD(livePriceUSD, isAmountsHidden)}
                          </div>
                          {ticker && (
                            <span
                              className={`text-[10px] font-bold ${
                                priceChange24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              24h: {priceChange24h >= 0 ? '+' : ''}
                              {priceChange24h.toFixed(2)}%
                            </span>
                          )}
                        </td>

                        <td className="py-4 px-4 text-right font-mono font-bold text-white">
                          <div>{formatVND(currentValVND, isAmountsHidden)}</div>
                          <div className="text-[10px] text-zinc-400">
                            ≈ {formatUSD(currentValUSD, isAmountsHidden)}
                          </div>
                        </td>

                        <td className="py-4 px-4 text-right font-mono">
                          <div
                            className={`font-bold inline-flex items-center space-x-1 ${
                              pnlUSD >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            <span>{pnlUSD >= 0 ? '+' : ''}</span>
                            <span>{formatVND(pnlVND, isAmountsHidden)}</span>
                          </div>
                          <div
                            className={`text-[10px] font-bold ${
                              pnlUSD >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {asset.buyPriceUSD === 0
                              ? 'Lợi nhuận từ airdrop'
                              : `${pnlUSD >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`}
                          </div>
                        </td>

                        <td className="py-4 px-6 text-center">
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={() => handleOpenEditModal(asset)}
                              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                              title="Sửa"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onDeleteCryptoAsset(asset.id)}
                              className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors"
                              title="Xóa"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: BINANCE LIVE MARKET TABLE */}
      {activeSubTab === 'market' && (
        <div className="bg-[#121214] border border-zinc-800 rounded-[32px] overflow-hidden shadow-2xl">
          <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-amber-400 animate-pulse" />
              <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">
                Bảng Giá Nhanh Binance Ticker (USDT Pairs)
              </h3>
            </div>
            <span className="text-xs text-zinc-400 font-mono">
              Cập nhật lúc: {lastUpdated || 'Đang kết nối API...'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#18181b] text-zinc-400 border-b border-zinc-800 uppercase font-mono tracking-wider">
                  <th className="py-3.5 px-6 font-bold">Cặp Giao Dịch</th>
                  <th className="py-3.5 px-4 font-bold text-right">Giá Binance (USD)</th>
                  <th className="py-3.5 px-4 font-bold text-right">Giá Trị Quy Đổi ({getDisplayCurrencyCode()})</th>
                  <th className="py-3.5 px-4 font-bold text-right">Biến Động 24h</th>
                  <th className="py-3.5 px-4 font-bold text-right">Cao / Thấp 24h</th>
                  <th className="py-3.5 px-6 font-bold text-center">Hành Động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-medium text-zinc-200">
                {filteredPopularCoins.map((coinItem) => {
                  const ticker = tickers[coinItem.symbol];
                  const livePriceUSD = ticker ? parseFloat(ticker.lastPrice) : 0;
                  const livePriceVND = livePriceUSD * usdVndRate;
                  const priceChangePercent = ticker ? parseFloat(ticker.priceChangePercent) : 0;
                  const high24h = ticker ? parseFloat(ticker.highPrice) : 0;
                  const low24h = ticker ? parseFloat(ticker.lowPrice) : 0;

                  return (
                    <tr key={coinItem.symbol} className="hover:bg-[#18181b] transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-black text-amber-400 text-xs">
                            {coinItem.coin}
                          </div>
                          <div>
                            <div className="font-extrabold text-white text-sm">
                              {coinItem.name}
                            </div>
                            <div className="text-[10px] text-zinc-400 font-mono">
                              {coinItem.symbol}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4 text-right font-mono font-bold text-amber-400 text-sm">
                        {ticker ? formatUSD(livePriceUSD, isAmountsHidden) : 'Đang tải...'}
                      </td>

                      <td className="py-4 px-4 text-right font-mono font-bold text-white">
                        {ticker ? formatVND(livePriceVND, isAmountsHidden) : '---'}
                      </td>

                      <td className="py-4 px-4 text-right font-mono">
                        {ticker ? (
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center space-x-1 ${
                              priceChangePercent >= 0
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {priceChangePercent >= 0 ? (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowDownRight className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {priceChangePercent >= 0 ? '+' : ''}
                              {priceChangePercent.toFixed(2)}%
                            </span>
                          </span>
                        ) : (
                          '---'
                        )}
                      </td>

                      <td className="py-4 px-4 text-right font-mono text-[11px] text-zinc-400">
                        {ticker ? (
                          <>
                            <div className="text-emerald-400 font-semibold">H: ${high24h}</div>
                            <div className="text-rose-400 font-semibold">L: ${low24h}</div>
                          </>
                        ) : (
                          '---'
                        )}
                      </td>

                      <td className="py-4 px-6 text-center">
                        <button
                          onClick={() =>
                            handleOpenAddModal(
                              coinItem.coin,
                              coinItem.name,
                              livePriceUSD ? livePriceUSD.toString() : '100'
                            )
                          }
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs rounded-xl shadow-md transition-all flex items-center space-x-1 mx-auto"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Thêm Danh Mục</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT CRYPTO ASSET */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
          <div className="bg-[#18181b] rounded-[32px] shadow-2xl max-w-md w-full overflow-hidden border border-zinc-800 text-zinc-100 my-8">
            <div className="bg-[#121214] p-5 flex items-center justify-between border-b border-zinc-800">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-2xl border border-amber-500/20">
                  <Coins className="w-5 h-5" />
                </div>
                <h3 className="text-base font-black tracking-tight text-white">
                  {editingAsset ? 'Chỉnh Sửa Tài Sản Mã Hóa' : 'Thêm Tài Sản Số Mới'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1.5 rounded-xl hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAsset} className="p-6 space-y-4">
              {/* 1. Coin Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase text-zinc-400">
                  1. Tìm Coin Trên Binance, OKX hoặc Bybit
                </label>
                {editingAsset ? (
                  <div className="p-3 bg-[#121214] border border-zinc-700 rounded-2xl text-xs">
                    <strong className="text-white">{formSymbol}</strong>
                    <span className="ml-2 text-zinc-400">{formExchange} · {formMarketPair}</span>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-500" />
                    <input
                      type="search"
                      value={coinSearch}
                      onChange={(event) => setCoinSearch(event.target.value)}
                      placeholder="Nhập BTC, ETH, PEPE..."
                      autoComplete="off"
                      className="w-full pl-10 pr-4 p-3 bg-[#121214] border border-zinc-700 rounded-2xl font-bold text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                    {(isSearchingCoins || coinSearchResults.length > 0 || coinSearchError) && (
                      <div className="absolute z-20 left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto bg-[#18181b] border border-zinc-700 rounded-2xl shadow-2xl">
                        {isSearchingCoins && (
                          <div className="p-3 text-xs text-zinc-400">Đang tìm trên 3 sàn...</div>
                        )}
                        {coinSearchError && (
                          <div className="p-3 text-xs text-rose-400">{coinSearchError}</div>
                        )}
                        {!isSearchingCoins && coinSearchResults.map((coin) => (
                          <button
                            key={`${coin.exchange}-${coin.pair}`}
                            type="button"
                            onClick={() => handleSelectSearchResult(coin)}
                            className="w-full px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-zinc-800 text-left border-b border-zinc-800/60 last:border-0"
                          >
                            <span>
                              <strong className="text-white text-xs">{coin.symbol}</strong>
                              <span className="block text-[10px] text-zinc-500">{coin.pair}</span>
                            </span>
                            <span className="text-right">
                              <strong className="block text-xs font-mono text-amber-400">
                                {formatUSD(coin.price)}
                              </strong>
                              <span className="text-[10px] text-zinc-400">{coin.exchange}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-500">Coin đã chọn</span>
                  <strong className="text-amber-400">
                    {formSymbol} · {formExchange}
                  </strong>
                </div>
              </div>

              {/* 2. Buy Price USD with live price button */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase text-zinc-400">
                    2. Giá Vốn (USD)
                  </label>
                  <button
                    type="button"
                    onClick={handleFillLivePrice}
                    className="text-[11px] font-bold text-amber-400 hover:underline flex items-center space-x-1"
                  >
                    <Zap className="w-3 h-3" />
                    <span>Lấy Giá {formExchange} Live</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={formBuyPrice}
                    onChange={(e) => setFormBuyPrice(e.target.value)}
                    placeholder="60000"
                    required
                    className="w-full pl-4 pr-14 p-3 bg-[#121214] border border-zinc-700 rounded-2xl font-black font-mono text-sm text-amber-400 focus:outline-none focus:border-amber-400"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400">
                    USD
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500">
                  Nhập 0 nếu coin được nhận miễn phí từ airdrop hoặc phần thưởng.
                </p>
              </div>

              {/* 3. Amount held */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase text-zinc-400">
                  3. Số Lượng Nắm Giữ
                </label>
                <input
                  type="number"
                  step="any"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="1.0"
                  required
                  className="w-full p-3 bg-[#121214] border border-zinc-700 rounded-2xl font-black font-mono text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* 4. Linked Jar Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase text-zinc-400">
                  4. Trích Từ Hũ Tài Chính Nào?
                </label>
                <select
                  value={formLinkedJarCode}
                  onChange={(e) => handleSelectJar(e.target.value)}
                  className="w-full p-3 bg-[#121214] border border-zinc-700 rounded-2xl font-bold text-xs text-white focus:outline-none focus:border-amber-400 cursor-pointer"
                >
                  {jars.map((j) => (
                    <option key={j.id} value={j.code} className="bg-[#18181b] text-white">
                      [{j.code}] Hũ {j.name} ({j.percentage}%)
                    </option>
                  ))}
                </select>
              </div>

              {/* 5. Notes */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase text-zinc-400">
                  Ghi Chú (Tùy chọn)
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="VD: Mua tích sản tháng này"
                  className="w-full p-3 bg-[#121214] border border-zinc-700 rounded-2xl font-medium text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="pt-3 flex items-center justify-end space-x-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-2xl border border-zinc-700 text-zinc-300 font-bold text-xs hover:bg-zinc-800 transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-extrabold text-xs shadow-lg shadow-amber-500/20 transition-all"
                >
                  Lưu Tài Sản
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
