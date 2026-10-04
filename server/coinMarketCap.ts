const PAGE_SIZE = 5000;
const MAX_PAGES = 10;
const CACHE_MS = 24 * 60 * 60 * 1000;

type CoinMapEntry = { id: number; symbol: string; rank?: number | null };

export function parseCoinIconSymbols(value: unknown): string[] | null {
  if (typeof value !== 'string' || value.length > 1000) return null;
  const symbols = [...new Set(value.split(',').map((symbol) => symbol.trim().toUpperCase()))];
  if (symbols.length === 0 || symbols.length > 50 ||
    symbols.some((symbol) => !/^[A-Z0-9]{1,30}$/.test(symbol))) return null;
  return symbols;
}

function isCoinMapEntry(value: unknown): value is CoinMapEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return Number.isSafeInteger(entry.id) && Number(entry.id) > 0 &&
    typeof entry.symbol === 'string' && /^[A-Z0-9]{1,30}$/.test(entry.symbol);
}

async function fetchCoinMapPage(start: number): Promise<unknown[]> {
  const url = `https://api.coinmarketcap.com/data-api/v3/map/all?listing_status=active&start=${start}&limit=${PAGE_SIZE}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`CoinMarketCap map HTTP ${response.status}`);
  const payload = await response.json() as { data?: { cryptoCurrencyMap?: unknown } };
  if (!Array.isArray(payload.data?.cryptoCurrencyMap)) throw new Error('CoinMarketCap map response invalid');
  return payload.data.cryptoCurrencyMap;
}

export function createCoinMarketCapLookup(fetchPage: (start: number) => Promise<unknown[]> = fetchCoinMapPage) {
  const cachedPages = new Map<number, { expiresAt: number; entries: unknown[] }>();
  const pendingPages = new Map<number, Promise<unknown[]>>();
  const loadPage = (start: number) => {
    const cached = cachedPages.get(start);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.entries);
    const pending = pendingPages.get(start);
    if (pending) return pending;
    const request = fetchPage(start).then((entries) => {
      cachedPages.set(start, { expiresAt: Date.now() + CACHE_MS, entries });
      return entries;
    }).finally(() => pendingPages.delete(start));
    pendingPages.set(start, request);
    return request;
  };

  return async (symbols: string[]): Promise<Record<string, number>> => {
    const wanted = new Set(symbols);
    const found: Record<string, { id: number; rank: number }> = {};
    for (let page = 0; page < MAX_PAGES && wanted.size > 0; page += 1) {
      const entries = await loadPage(page * PAGE_SIZE + 1);
      for (const entry of entries) {
        if (!isCoinMapEntry(entry)) continue;
        if (!wanted.has(entry.symbol)) continue;
        const rank = typeof entry.rank === 'number' && entry.rank > 0 ? entry.rank : Number.MAX_SAFE_INTEGER;
        if (!found[entry.symbol] || rank < found[entry.symbol].rank)
          found[entry.symbol] = { id: entry.id, rank };
      }
      // Pages are ordered by rank. A symbol found here has its highest-ranked match.
      for (const symbol of Object.keys(found)) wanted.delete(symbol);
      if (entries.length < PAGE_SIZE) break;
    }
    return Object.fromEntries(Object.entries(found).map(([symbol, entry]) => [symbol, entry.id]));
  };
}

export const lookupCoinMarketCapIds = createCoinMarketCapLookup();
