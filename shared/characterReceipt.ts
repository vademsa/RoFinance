import { COSMETICS, canExchangeCosmetic, FUSE_COPIES, RECYCLE_COPIES, type ItemMaterial, type MaterialKind } from './character';

export type PendingCharacterAction = { kind: 'draw' | 'exchange' | MaterialKind; requestId: string; itemId?: string; items?: ItemMaterial[] };
export interface CharacterReceiptStorage {
  keys(): Promise<string[]>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
export const receiptKey = (owner: string, requestId = '') => `rofinance-character-pending-v1:${owner}:${requestId}`;
// This receipt contains no tokens, balances or financial records, and is never
// authoritative: the server still checks authentication, ownership and inventory.
export function parseCharacterReceipt(value: string | null): PendingCharacterAction | null {
  try {
    const input = JSON.parse(value || 'null');
    if (!input || typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) return null;
    if (input.kind === 'draw' && Object.keys(input).every((key) => ['kind', 'requestId'].includes(key))) return { kind: 'draw', requestId: input.requestId };
    if (input.kind === 'exchange' && Object.keys(input).every((key) => ['kind', 'requestId', 'itemId'].includes(key)) && COSMETICS.some((item) => item.id === input.itemId && canExchangeCosmetic(item))) {
      return { kind: 'exchange', requestId: input.requestId, itemId: input.itemId };
    }
    if ((input.kind === 'recycle' || input.kind === 'fuse') && Object.keys(input).every((key) => ['kind', 'requestId', 'items'].includes(key)) && Array.isArray(input.items)) {
      const needed = input.kind === 'recycle' ? RECYCLE_COPIES : FUSE_COPIES;
      const ids = new Set<string>();
      if (!input.items.length || input.items.length > needed || !input.items.every((entry: any) => {
        if (!entry || Object.keys(entry).length !== 2 || !Object.keys(entry).every((key) => ['itemId', 'count'].includes(key)) || !Number.isSafeInteger(entry.count) || entry.count < 1 || entry.count > needed || ids.has(entry.itemId) || !COSMETICS.some((item) => item.id === entry.itemId && !item.starter)) return false;
        ids.add(entry.itemId); return true;
      }) || input.items.reduce((sum: number, entry: ItemMaterial) => sum + entry.count, 0) !== needed) return null;
      const rarity = COSMETICS.find((item) => item.id === input.items[0].itemId)!.rarity;
      if (input.kind === 'fuse' && (rarity === 'legendary' || input.items.some((entry: ItemMaterial) => COSMETICS.find((item) => item.id === entry.itemId)!.rarity !== rarity))) return null;
      return { kind: input.kind, requestId: input.requestId, items: input.items.map((entry: ItemMaterial) => ({ itemId: entry.itemId, count: entry.count })) };
    }
  } catch { /* Corrupt local receipts are not trusted. */ }
  return null;
}
export async function nextCharacterReceipt(storage: CharacterReceiptStorage, owner: string) {
  const keys = (await storage.keys()).filter((key) => key.startsWith(receiptKey(owner))).sort();
  for (const key of keys) {
    const receipt = parseCharacterReceipt(await storage.get(key));
    if (receipt && key === receiptKey(owner, receipt.requestId)) return receipt;
  }
  return null;
}
