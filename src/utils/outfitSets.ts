import { COSMETICS, ITEM_SLOTS, type Equipment } from '../../shared/character';

export type SetMotif = 'leaves' | 'petals' | 'stars' | 'grid' | 'sun' | 'waves' | 'electric' | 'snow' | 'sigil' | 'constellation' | 'phoenix' | 'signature';
export interface OutfitSet {
  id: string; vi: string; en: string; main: string; light: string; motif: SetMotif;
  items: Readonly<Equipment>;
}

// Only complete, existing seven-slot collections are sets. Starter items and
// individual secrets are deliberately excluded; no inventory IDs are added.
export const OUTFIT_SETS: readonly OutfitSet[] = ([
  ['mint', 'Xanh ngọc', 'Mint', '#059669', '#a7f3d0', 'leaves'],
  ['rose', 'Hồng ngọc', 'Rose', '#db2777', '#fbcfe8', 'petals'],
  ['gold', 'Ánh sao', 'Starlight', '#b45309', '#fde68a', 'stars'],
  ['denim', 'Denim', 'Denim', '#2563eb', '#bfdbfe', 'grid'],
  ['sunset', 'Hoàng hôn', 'Sunset', '#ea580c', '#fed7aa', 'sun'],
  ['forest', 'Rừng xanh', 'Forest', '#15803d', '#bbf7d0', 'leaves'],
  ['sailor', 'Thủy thủ', 'Sailor', '#0891b2', '#a5f3fc', 'waves'],
  ['neon', 'Neon', 'Neon', '#65a30d', '#d9f99d', 'electric'],
  ['sakura', 'Hoa anh đào', 'Sakura', '#db2777', '#fce7f3', 'petals'],
  ['winter', 'Mùa đông', 'Winter', '#475569', '#e0f2fe', 'snow'],
  ['royal', 'Hoàng gia', 'Royal', '#7e22ce', '#fde68a', 'sigil'],
  ['celestial', 'Thiên hà', 'Celestial', '#818cf8', '#a5f3fc', 'constellation'],
  ['phoenix', 'Phượng hoàng', 'Phoenix', '#f97316', '#fef08a', 'phoenix'],
  ['rofinance', 'RoFinance Signature · Độc quyền', 'RoFinance Signature · Exclusive', '#d4af37', '#f8fafc', 'signature'],
  ['male-classic', 'Thanh lịch · Nam', 'Classic · Male', '#315c85', '#bfdbfe', 'grid'],
  ['female-classic', 'Thanh lịch · Nữ', 'Classic · Female', '#be527c', '#fbcfe8', 'petals'],
] as const).map(([id, vi, en, main, light, motif]) => ({
  id, vi, en, main, light, motif,
  items: Object.fromEntries(ITEM_SLOTS.map((slot) => [slot, `${slot}-${id}`])) as Equipment,
}));

export function outfitSetOwnedCount(set: OutfitSet, ownedItemIds: readonly string[]): number {
  const owned = new Set(ownedItemIds);
  return ITEM_SLOTS.filter((slot) => owned.has(set.items[slot]!)).length;
}

/** Private previews must provide ownership. Public portraits use already
 * server-validated equipment, without exposing the owner's inventory. */
export function equippedOutfitSet(equipped: Equipment, ownedItemIds?: readonly string[]): OutfitSet | undefined {
  const owned = ownedItemIds === undefined ? undefined : new Set(ownedItemIds);
  return OUTFIT_SETS.find((set) => ITEM_SLOTS.every((slot) => {
    const id = set.items[slot];
    return id === equipped[slot] && (!owned || owned.has(id!))
      && COSMETICS.some((item) => item.id === id && item.slot === slot && !item.starter);
  }));
}
