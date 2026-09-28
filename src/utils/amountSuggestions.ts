export function getDynamicAmountSuggestions(value: number, count = 3) {
  if (!Number.isFinite(value) || value <= 0 || count <= 0) return [];
  let significant = Math.round(value);
  while (significant >= 10 && significant % 10 === 0) significant /= 10;
  let firstSuggestion = significant;
  while (firstSuggestion < 10_000) firstSuggestion *= 10;

  return Array.from({ length: count }, (_, index) =>
    Math.round(firstSuggestion * (10 ** index))
  ).filter((amount) => Number.isSafeInteger(amount));
}
