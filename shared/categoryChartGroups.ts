// A display-only contract. It contains no amounts, transactions or account data.
export interface ChartCategoryInput { id: string; label: string }
export interface ChartGroupSuggestion { name: string; memberIds: string[] }
export interface ChartGroupRequest {
  type: 'income' | 'expense';
  language: 'vi' | 'en';
  categories: ChartCategoryInput[];
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const only = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0
  && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const normalized = (value: string) => value.trim().normalize('NFC').toLocaleLowerCase();

export function parseChartGroupRequest(value: unknown): ChartGroupRequest | null {
  if (!object(value) || !only(value, ['type', 'language', 'categories'])
    || (value.type !== 'income' && value.type !== 'expense') || (value.language !== 'vi' && value.language !== 'en')
    || !Array.isArray(value.categories) || value.categories.length < 2 || value.categories.length > 200) return null;
  const ids = new Set<string>();
  const labels = new Set<string>();
  for (const row of value.categories) {
    if (!object(row) || !only(row, ['id', 'label']) || typeof row.id !== 'string' || !/^c\d{1,3}$/.test(row.id)
      || !text(row.label, 120) || ids.has(row.id) || labels.has(row.label.trim())) return null;
    ids.add(row.id); labels.add(row.label.trim());
  }
  return { type: value.type as ChartGroupRequest['type'], language: value.language as ChartGroupRequest['language'],
    categories: value.categories.map(row => ({ id: row.id, label: row.label.trim() })) };
}

// Never trust model output (or a modified client response) to invent members,
// double-count categories, or introduce ambiguous group/category labels.
export function parseChartGroupSuggestions(value: unknown, categories: ChartCategoryInput[]): ChartGroupSuggestion[] | null {
  if (!object(value) || !only(value, ['groups']) || !Array.isArray(value.groups) || value.groups.length > 50) return null;
  const allowed = new Set(categories.map(row => row.id));
  const names = new Set(categories.map(row => normalized(row.label)));
  const used = new Set<string>();
  const groups: ChartGroupSuggestion[] = [];
  for (const row of value.groups) {
    if (!object(row) || !only(row, ['name', 'memberIds']) || !text(row.name, 70) || names.has(normalized(row.name))
      || !Array.isArray(row.memberIds) || row.memberIds.length < 2 || row.memberIds.length > categories.length) return null;
    for (const id of row.memberIds) {
      if (typeof id !== 'string' || !allowed.has(id) || used.has(id)) return null;
      used.add(id);
    }
    names.add(normalized(row.name));
    groups.push({ name: row.name.trim(), memberIds: [...row.memberIds] });
  }
  return groups;
}
