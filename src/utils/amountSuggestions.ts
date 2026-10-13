export function getDynamicAmountSuggestions(value: number, count = 4) {
  if (!Number.isSafeInteger(value) || value <= 0 || !Number.isInteger(count) || count <= 0) return [];
  return Array.from({ length: Math.min(count, 12) }, (_, index) => value * (10 ** (index + 2)))
    .filter((amount) => Number.isSafeInteger(amount) && amount <= 1_000_000_000_000_000);
}
