/** Reward points use dot-grouped integers, never currency conversion or decimals. */
export function formatAdminPoints(digits: string): string {
  return digits.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Accept plain integers or consistently grouped pasted integers; reject decimals/signs. */
export function parseAdminPoints(text: string): string | null {
  const value = text.trim();
  if (!value) return '';
  if (!/^(?:\d+|[1-9]\d{0,2}(?:\.\d{3})+|[1-9]\d{0,2}(?:,\d{3})+)$/.test(value)) return null;
  const digits = value.replace(/[.,]/g, '').replace(/^0+(?=\d)/, '');
  return digits.length <= 16 ? digits : null;
}
