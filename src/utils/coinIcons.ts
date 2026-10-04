// CMC IDs are stable. These frequently used coins can show their icons even
// before the optional live symbol lookup returns (or while an older API runs).
export const COMMON_COIN_ICON_IDS: Record<string, number> = {
  BTC: 1, ETH: 1027, BNB: 1839, SOL: 5426, XRP: 52, DOGE: 74,
  ADA: 2010, AVAX: 5805, NEAR: 6535, DOT: 6636, LINK: 1975,
  SUI: 20947, PEPE: 24478, CAKE: 7186, GRASS: 32956,
};

export function getCoinIconUrl(coinMarketCapId: number | undefined): string | null {
  return Number.isSafeInteger(coinMarketCapId) && Number(coinMarketCapId) > 0
    ? `https://s2.coinmarketcap.com/static/img/coins/64x64/${coinMarketCapId}.png`
    : null;
}
