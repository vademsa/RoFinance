import type { CategoryTotal } from './analytics';
import type { Transaction } from '../types';

export interface CategoryChartView {
  selectedNames: string[] | null; // null = all, [] = none. Never persisted.
  groups: { name: string; members: string[] }[];
}
export interface ChartCategoryRow extends CategoryTotal { sourceNames: string[] }
export const defaultCategoryChartView = (): CategoryChartView => ({ selectedNames: null, groups: [] });

export function buildCategoryChartView(categories: CategoryTotal[], view: CategoryChartView): ChartCategoryRow[] {
  const selected = view.selectedNames === null ? null : new Set(view.selectedNames);
  const available = categories.filter(row => !selected || selected.has(row.name));
  const used = new Set<string>();
  const reserved = new Set(categories.map(row => row.name.trim().normalize('NFC').toLocaleLowerCase()));
  const result: ChartCategoryRow[] = [];
  for (const group of view.groups) {
    const members = new Set(group.members);
    const rows = available.filter(row => members.has(row.name) && !used.has(row.name));
    const name = group.name.trim();
    const key = name.normalize('NFC').toLocaleLowerCase();
    // If data changes while the view is open, obsolete/invalid groups dissolve
    // safely rather than hiding, duplicating or relabelling original records.
    if (!name || reserved.has(key) || rows.length < 2) continue;
    reserved.add(key);
    rows.forEach(row => used.add(row.name));
    result.push({ name, isCustom: true, amount: rows.reduce((sum, row) => sum + row.amount, 0),
      count: rows.reduce((sum, row) => sum + row.count, 0), sourceNames: rows.map(row => row.name) });
  }
  result.push(...available.filter(row => !used.has(row.name)).map(row => ({ ...row, sourceNames: [row.name] })));
  return result.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'vi'));
}

export function getChartCategoryTransactions(transactions: Transaction[], type: 'income' | 'expense', sourceNames: string[]): Transaction[] {
  const names = new Set(sourceNames);
  return transactions.filter(tx => tx.type === type && Number.isFinite(tx.amount) && tx.amount > 0
    && names.has(tx.category?.trim() || 'Chưa phân loại'))
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
