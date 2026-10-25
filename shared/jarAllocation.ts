// Suggestions are drafts, never financial writes. The AI sees percentages only,
// not bank details, transaction histories, debt names or monetary amounts.
export interface JarAllocationRequest {
  language: 'vi' | 'en';
  jars: { code: string; percentage: number }[];
  editableCodes: string[];
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const keysAre = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
const safeCode = (value: unknown): value is string => typeof value === 'string' &&
  value.length > 0 && value.length <= 32 && value.trim() === value &&
  !/[\u0000-\u001f\u007f]/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
export const percentUnits = (value: number) => Math.round(value * 100);
const validPercent = (value: unknown): value is number => typeof value === 'number' &&
  Number.isFinite(value) && value >= 0 && value <= 100 &&
  Math.abs(value * 100 - percentUnits(value)) < 1e-7;

export function parseJarAllocationRequest(raw: unknown): JarAllocationRequest | null {
  if (!record(raw) || !keysAre(raw, ['language', 'jars', 'editableCodes']) ||
    !['vi', 'en'].includes(String(raw.language)) || !Array.isArray(raw.jars) ||
    raw.jars.length < 2 || raw.jars.length > 50 || !Array.isArray(raw.editableCodes) || !raw.editableCodes.length) return null;
  if (raw.jars.some(jar => !record(jar) || !keysAre(jar, ['code', 'percentage']) ||
    !safeCode(jar.code) || !validPercent(jar.percentage))) return null;
  const jars = raw.jars as JarAllocationRequest['jars'];
  const codes = new Set(jars.map(jar => jar.code));
  if (codes.size !== jars.length || !codes.has('DEBT') ||
    jars.reduce((sum, jar) => sum + percentUnits(jar.percentage), 0) !== 10000 ||
    raw.editableCodes.length > jars.length ||
    raw.editableCodes.some(code => !safeCode(code) || code === 'DEBT' || !codes.has(code)) ||
    new Set(raw.editableCodes).size !== raw.editableCodes.length) return null;
  const editableCodes = raw.editableCodes as string[];
  if (jars.filter(jar => editableCodes.includes(jar.code)).reduce((sum, jar) => sum + percentUnits(jar.percentage), 0) <= 0) return null;
  return { language: raw.language as 'vi' | 'en', jars: jars.map(jar => ({ ...jar })), editableCodes: [...editableCodes] };
}

export interface JarAllocationSuggestion { success: true; allocation: Record<string, number>; reason: string }
const safeReason = (value: unknown): value is string => typeof value === 'string' &&
  value.trim().length > 0 && value.length <= 600 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);

export function parseJarAllocationSuggestion(raw: unknown, input: JarAllocationRequest): JarAllocationSuggestion | null {
  if (!record(raw) || raw.success !== true || !record(raw.allocation) || !safeReason(raw.reason) ||
    !keysAre(raw.allocation, input.jars.map(jar => jar.code))) return null;
  const allocation = raw.allocation;
  if (input.jars.some(jar => !validPercent(allocation[jar.code]) ||
    (!input.editableCodes.includes(jar.code) && percentUnits(allocation[jar.code] as number) !== percentUnits(jar.percentage))) ||
    Object.values(allocation).reduce<number>((sum, value) => sum + percentUnits(value as number), 0) !== 10000) return null;
  return { success: true, allocation: Object.fromEntries(input.jars.map(jar => [jar.code, allocation[jar.code] as number])), reason: raw.reason.trim() };
}

export function buildJarAllocationSuggestion(raw: unknown, input: JarAllocationRequest): JarAllocationSuggestion | null {
  if (!record(raw) || !keysAre(raw, ['weights', 'reason']) || !Array.isArray(raw.weights) ||
    raw.weights.length !== input.editableCodes.length || !safeReason(raw.reason)) return null;
  const weights: { code: string; weight: number }[] = [];
  for (const item of raw.weights) {
    if (!record(item) || !keysAre(item, ['code', 'weight']) || !safeCode(item.code) ||
      !input.editableCodes.includes(item.code) || typeof item.weight !== 'number' ||
      !Number.isFinite(item.weight) || item.weight < 0 || item.weight > 1_000_000) return null;
    weights.push({ code: item.code, weight: item.weight });
  }
  if (new Set(weights.map(item => item.code)).size !== weights.length) return null;
  const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return null;
  const available = input.jars.filter(jar => input.editableCodes.includes(jar.code)).reduce((sum, jar) => sum + percentUnits(jar.percentage), 0);
  const exact = weights.map(item => available * item.weight / totalWeight);
  const units = exact.map(Math.floor);
  const remainderOrder = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) })).sort((a, b) => b.fraction - a.fraction);
  const remainder = available - units.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < remainder; index++) units[remainderOrder[index % weights.length].index]++;
  const allocation = Object.fromEntries(input.jars.map(jar => [jar.code, jar.percentage]));
  weights.forEach((item, index) => { allocation[item.code] = units[index] / 100; });
  return parseJarAllocationSuggestion({ success: true, allocation, reason: raw.reason }, input);
}
