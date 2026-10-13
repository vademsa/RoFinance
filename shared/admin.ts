export interface AdminOverview {
  version: 1;
  mode: 'read-only' | 'operations';
  operationsEnabled?: boolean;
  generatedAt: string;
  counts: { accounts: number; characters: number; rankingParticipants: number; drawsLast7Days: number };
  catalogue: { total: number; prizes: number; signature: number; hidden: number };
  release: { apiRevision: string; webRevision: string | null };
}

/** Presentation validation only; never a source of admin permission. */
export function isAdminOverview(value: unknown): value is AdminOverview {
  if (!value || typeof value !== 'object') return false;
  const row = value as AdminOverview;
  const count = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
  return row.version === 1 && ['read-only', 'operations'].includes(row.mode) && (row.operationsEnabled === undefined || typeof row.operationsEnabled === 'boolean') && typeof row.generatedAt === 'string' &&
    Number.isFinite(Date.parse(row.generatedAt)) && Boolean(row.counts) &&
    ['accounts', 'characters', 'rankingParticipants', 'drawsLast7Days'].every(key => count(row.counts[key as keyof AdminOverview['counts']])) &&
    Boolean(row.catalogue) && ['total', 'prizes', 'signature', 'hidden'].every(key => count(row.catalogue[key as keyof AdminOverview['catalogue']])) &&
    Boolean(row.release) && /^[a-f0-9]{64}$/.test(row.release.apiRevision) &&
    (row.release.webRevision === null || typeof row.release.webRevision === 'string' && /^[a-f0-9-]{36}$/i.test(row.release.webRevision));
}

export type AdminOperationKind = 'revoke-sessions' | 'grant-points' | 'revoke-points' | 'grant-item' | 'revoke-item';
export interface AdminInventory {
  targetId: string;
  points: { available: number; spent: number; revoked: number };
  items: { itemId: string; copies: number; equipped: boolean }[];
}
export interface AdminAccount {
  id: string; email: string; displayName: string; createdAt: string; isOwner: boolean; hasCharacter: boolean;
}
export interface AdminAccountPage { accounts: AdminAccount[]; total: number; page: number; pageSize: number }
export interface AdminAuditEntry {
  requestId: string; targetId: string; kind: AdminOperationKind; reason: string; createdAt: string;
  result: { points?: number; itemId?: string; copies?: number; webSessions?: number; mobileSessions?: number };
}
export interface AdminAuditPage { entries: AdminAuditEntry[]; total: number; page: number; pageSize: number }

/** Recognize encoded/case-varied namespace aliases before any SPA fallback. */
export function isAdminPagePath(pathname: string): boolean {
  let path = pathname;
  try { path = decodeURIComponent(path); } catch { /* Invalid encoding does not grant access. */ }
  return /^\/admin(?:\/|$)/i.test(path);
}

export function isAdminApiPath(pathname: string): boolean {
  let path = pathname;
  try { path = decodeURIComponent(path); } catch { /* Malformed paths are not privileged. */ }
  return /^\/api\/admin(?:\/|$)/i.test(path);
}
