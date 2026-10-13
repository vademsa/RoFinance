import { COSMETICS, FUSE_COPIES, RECYCLE_COPIES, type CharacterProfile, type ItemMaterial, type MaterialKind, type Rarity } from '../../shared/character';

export function workshopMaterials(profile: CharacterProfile, kind: MaterialKind, rarity: Rarity, quantities: Record<string, number>): ItemMaterial[] {
  let remaining = kind === 'fuse' ? FUSE_COPIES : RECYCLE_COPIES;
  return COSMETICS.flatMap((item) => {
    const requested = quantities[item.id];
    const available = profile.duplicateItemCounts?.[item.id] ?? 0;
    if (!remaining || item.starter || !profile.ownedItemIds.includes(item.id)
      || (kind === 'fuse' && (item.rarity !== rarity || rarity === 'legendary'))
      || !Number.isSafeInteger(requested) || requested <= 0 || !Number.isSafeInteger(available) || available <= 0) return [];
    const count = Math.min(requested, available, remaining);
    remaining -= count;
    return [{ itemId: item.id, count }];
  });
}

export function changeWorkshopQuantity(profile: CharacterProfile, kind: MaterialKind, rarity: Rarity,
  quantities: Record<string, number>, itemId: string, requested: number): Record<string, number> {
  const selected = workshopMaterials(profile, kind, rarity, quantities);
  const item = COSMETICS.find((entry) => entry.id === itemId);
  if (!item || item.starter || !profile.ownedItemIds.includes(itemId) || !Number.isSafeInteger(requested)
    || (kind === 'fuse' && (item.rarity !== rarity || rarity === 'legendary'))) return quantities;
  const others = selected.filter((entry) => entry.itemId !== itemId).reduce((sum, entry) => sum + entry.count, 0);
  const needed = kind === 'fuse' ? FUSE_COPIES : RECYCLE_COPIES;
  const rawAvailable = profile.duplicateItemCounts?.[itemId] ?? 0;
  const available = Number.isSafeInteger(rawAvailable) && rawAvailable > 0 ? rawAvailable : 0;
  return { ...Object.fromEntries(selected.map((entry) => [entry.itemId, entry.count])),
    [itemId]: Math.max(0, Math.min(requested, available, needed - others)) };
}

export function materialCopies(materials: ItemMaterial[]) {
  return materials.flatMap((entry) => Array.from({ length: Math.min(FUSE_COPIES, Math.max(0, entry.count)) }, () => entry.itemId)).slice(0, FUSE_COPIES);
}
