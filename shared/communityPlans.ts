export const ENGAGEMENT_POINTS = 20;
export const COMMUNITY_PAGE_SIZE = 12;
export interface PublicJarDesign { code: string; name: string; percentage: number; color: string; description: string }
export interface CommunityDesign { title: string; description: string; publicAlias: string; jars: PublicJarDesign[] }
export interface CommunityPlan extends CommunityDesign { id: string; isOwner: boolean; active: boolean; adoptionCount: number }

const record = (x: unknown): x is Record<string, unknown> => Boolean(x && typeof x === 'object' && !Array.isArray(x));
function fields(x: unknown, allowed: string[]): asserts x is Record<string, unknown> {
  if (!record(x) || Object.keys(x).some(k => !allowed.includes(k)) || allowed.some(k => !(k in x))) throw new Error('INVALID_DESIGN');
}
function text(x: unknown, max: number, empty = false): string {
  if (typeof x !== 'string' || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(x)) throw new Error('INVALID_DESIGN');
  const value = x.normalize('NFC').trim();
  if ((!empty && !value) || Array.from(value).length > max) throw new Error('INVALID_DESIGN');
  return value;
}
/** Explicit, design-only whitelist. Private finance/bank fields are rejected. */
export function validateCommunityDesign(value: unknown): CommunityDesign {
  fields(value, ['title', 'description', 'publicAlias', 'jars']);
  const publicAlias = text(value.publicAlias, 24);
  if (!/^[\p{L}\p{N} ._-]{2,24}$/u.test(publicAlias)) throw new Error('INVALID_DESIGN');
  if (!Array.isArray(value.jars) || !value.jars.length || value.jars.length > 20) throw new Error('INVALID_DESIGN');
  const codes = new Set<string>();
  const jars = value.jars.map(raw => {
    fields(raw, ['code', 'name', 'percentage', 'color', 'description']);
    const code = text(raw.code, 16);
    if (!/^[A-Z][A-Z0-9_]{0,15}$/.test(code) || codes.has(code)) throw new Error('INVALID_DESIGN');
    codes.add(code);
    if (typeof raw.percentage !== 'number' || !Number.isFinite(raw.percentage) || raw.percentage < 0 || raw.percentage > 100 || Math.abs(raw.percentage * 100 - Math.round(raw.percentage * 100)) > 0.000001) throw new Error('INVALID_DESIGN');
    if (typeof raw.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(raw.color)) throw new Error('INVALID_DESIGN');
    return { code, name: text(raw.name, 60), percentage: raw.percentage, color: raw.color.toLowerCase(), description: text(raw.description, 140, true) };
  });
  if (jars.reduce((s, j) => s + Math.round(j.percentage * 100), 0) !== 10000) throw new Error('INVALID_PERCENTAGE_TOTAL');
  return { title: text(value.title, 80), description: text(value.description, 300, true), publicAlias, jars };
}
export function isCommunityPlan(value: unknown): value is CommunityPlan {
  if (!record(value) || Object.keys(value).some(k => !['title','description','publicAlias','jars','id','isOwner','active','adoptionCount'].includes(k))) return false;
  if (!record(value) || typeof value.id !== 'string' || !/^[0-9a-f-]{36}$/.test(value.id) || typeof value.isOwner !== 'boolean' || typeof value.active !== 'boolean' || !Number.isSafeInteger(value.adoptionCount) || Number(value.adoptionCount) < 0) return false;
  try { validateCommunityDesign({ title: value.title, description: value.description, publicAlias: value.publicAlias, jars: value.jars }); return true; } catch { return false; }
}
