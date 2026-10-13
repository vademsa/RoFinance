import { CHARACTERS, CHARACTER_GENDERS, COSMETICS, RARITIES, DRAW_COST, FUSE_COPIES, RECYCLE_COPIES, calendarDate, validateEquipment, type CharacterProfile, type DrawResult, type LeaderboardEntry, type MaterialResult, type MaterialKind, type ItemMaterial } from '../../shared/character';

const record = (value: unknown): value is Record<string, any> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const score = (value: unknown) => count(value) && Number(value) <= 100;
const knownItem = (id: unknown) => typeof id === 'string' && COSMETICS.some((item) => item.id === id);
export function isCharacterProfile(value: unknown): value is CharacterProfile {
  if (!record(value) || value.version !== 1 || value.rulesVersion !== 1 || !CHARACTERS.some((item) => item.id === value.characterId) ||
    (value.gender !== undefined && !CHARACTER_GENDERS.some(gender => gender === value.gender)) || typeof value.nickname !== 'string' || value.nickname.length > 100 || typeof value.optIn !== 'boolean' ||
    !Array.isArray(value.ownedItemIds) || value.ownedItemIds.length > COSMETICS.length || new Set(value.ownedItemIds).size !== value.ownedItemIds.length || !value.ownedItemIds.every(knownItem) ||
    !validateEquipment(value.equipped, value.ownedItemIds) || !calendarDate(value.enrolledCycleStart) || typeof value.enrolledAt !== 'string' ||
    !['fragments', 'spentPoints', 'drawCount', 'pityCount', 'availablePoints', 'pointsShortfall', 'lifetimeScore', 'level'].every((key) => count(value[key])) ||
    value.pityCount > 9 || value.level < 1 || !record(value.awards) || (value.bonusPoints !== undefined && !count(value.bonusPoints)) ||
    (value.recycledPoints !== undefined && !count(value.recycledPoints)) || (value.revokedPoints !== undefined && !count(value.revokedPoints))) return false;
  if (value.duplicateItemCounts !== undefined && (!record(value.duplicateItemCounts) || !Object.entries(value.duplicateItemCounts).every(([id, copies]) =>
    count(copies) && value.ownedItemIds.includes(id) && COSMETICS.some((item) => item.id === id && !item.starter)))) return false;
  if (!Object.entries(value.awards).every(([season, award]) => /^\d{4}-(0[1-9]|1[0-2])$/.test(season) && record(award) && score(award.score) &&
    count(award.points) && award.points <= 20 && calendarDate(award.cycleStart) && calendarDate(award.cycleEnd))) return false;
  const assessment = value.assessment;
  return record(assessment) && ['happy', 'steady', 'worried', 'attention'].includes(assessment.mood) &&
    (assessment.score === null || score(assessment.score)) && typeof assessment.eligible === 'boolean' &&
    calendarDate(assessment.cycleStart) && calendarDate(assessment.cycleEnd) && Array.isArray(assessment.reasons) &&
    assessment.reasons.length <= 20 && assessment.reasons.every((reason: unknown) => typeof reason === 'string' && reason.length <= 100);
}
export function isDrawResult(value: unknown): value is DrawResult {
  if (!record(value) || typeof value.duplicate !== 'boolean' || typeof value.guaranteed !== 'boolean') return false;
  if (value.itemId === null) return !value.duplicate && value.fragments === 0 && !value.guaranteed;
  // Previously committed duplicate receipts still carry five legacy fragments.
  return knownItem(value.itemId) && !COSMETICS.find((item) => item.id === value.itemId)?.starter && (value.fragments === 0 || (value.duplicate && value.fragments === 5));
}
export function isMaterialResult(value: unknown, kind: MaterialKind, materials: ItemMaterial[]): value is MaterialResult {
  if (!record(value) || Object.keys(value).length !== 5 || !Object.keys(value).every((key) => ['kind', 'consumed', 'points', 'itemId', 'duplicate'].includes(key)) || value.kind !== kind || !Array.isArray(value.consumed) || typeof value.duplicate !== 'boolean') return false;
  const canonical = (items: ItemMaterial[]) => JSON.stringify(items.map((entry) => ({ itemId: entry.itemId, count: entry.count })).sort((a, b) => a.itemId.localeCompare(b.itemId)));
  if (!value.consumed.every((entry: unknown) => record(entry) && Object.keys(entry).length === 2 && knownItem(entry.itemId) && count(entry.count) && entry.count > 0) || canonical(value.consumed) !== canonical(materials)) return false;
  if (materials.reduce((sum, entry) => sum + entry.count, 0) !== (kind === 'recycle' ? RECYCLE_COPIES : FUSE_COPIES)) return false;
  if (new Set(materials.map((entry) => entry.itemId)).size !== materials.length || materials.some((entry) => !Number.isSafeInteger(entry.count) || entry.count < 1 || !COSMETICS.some((item) => item.id === entry.itemId && !item.starter))) return false;
  if (kind === 'recycle') return value.points === DRAW_COST && value.itemId === null && !value.duplicate;
  const source = COSMETICS.find((item) => item.id === materials[0]?.itemId);
  const prize = COSMETICS.find((item) => item.id === value.itemId && !item.starter);
  return Boolean(source && prize && source.rarity !== 'legendary' && materials.every((entry) => COSMETICS.find((item) => item.id === entry.itemId)?.rarity === source.rarity) && RARITIES.indexOf(prize.rarity) === RARITIES.indexOf(source.rarity) + 1 && value.points === 0);
}
export function isLeaderboardEntry(value: unknown): value is LeaderboardEntry {
  return record(value) && [5, 6].includes(Object.keys(value).length) && Object.keys(value).every((key) => ['rank', 'nickname', 'characterId', 'gender', 'equipped', 'score'].includes(key)) && (value.gender === undefined || CHARACTER_GENDERS.some(gender => gender === value.gender)) &&
    count(value.rank) && value.rank >= 1 && typeof value.nickname === 'string' && value.nickname.length <= 100 && score(value.score) &&
    CHARACTERS.some((item) => item.id === value.characterId) && Boolean(validateEquipment(value.equipped, COSMETICS.map((item) => item.id)));
}
