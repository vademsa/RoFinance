import { COSMETICS, type Cosmetic, type Equipment } from '../../shared/character';

export type CosmeticTheme = 'plain' | 'comet' | 'aurora' | 'orbit' | 'celestial' | 'phoenix' | 'singularity' | 'dragon' | 'astral' | 'eclipse' | 'signature';
export const cosmeticAura = (item: Cosmetic) => item.secret ? 'rainbow' : item.rarity === 'legendary' ? 'platinum' : item.rarity === 'special' ? 'gold' : item.rarity === 'rare' ? 'purple' : 'neutral';

export function equippedAuraItems(equipped: Equipment): Cosmetic[] {
  return Object.entries(equipped).flatMap(([slot, id]) => COSMETICS.filter((item) => item.id === id && item.slot === slot && item.rarity !== 'common'));
}

/** Only canonical, correctly slotted equipment contributes to this visual effect. */
export function equippedAuraItem(equipped: Equipment): Cosmetic | undefined {
  const priority = { common: 0, rare: 1, special: 2, legendary: 3 };
  const items = equippedAuraItems(equipped);
  return items.reduce<Cosmetic | undefined>((best, item) => {
    const rank = (entry: Cosmetic) => entry.secret ? 4 : priority[entry.rarity];
    return !best || rank(item) > rank(best) ? item : best;
  }, undefined);
}
export function cosmeticTheme(item: Cosmetic): CosmeticTheme {
  if (item.rarity !== 'legendary') return 'plain';
  if (item.exclusive && item.id === `${item.slot}-rofinance`) return 'signature';
  if (item.id === 'hat-comet') return 'comet';
  if (item.id === 'shirt-aurora') return 'aurora';
  if (item.id === 'backpack-orbit') return 'orbit';
  return ({ 13: 'celestial', 14: 'phoenix', 15: 'singularity', 16: 'dragon', 17: 'astral', 18: 'eclipse' } as const)[item.variant] || 'celestial';
}
export const themeColors: Record<CosmeticTheme, [string, string]> = {
  plain: ['#818cf8', '#e0e7ff'], comet: ['#c084fc', '#fef3c7'], aurora: ['#2dd4bf', '#f0abfc'],
  orbit: ['#a78bfa', '#67e8f9'], celestial: ['#818cf8', '#67e8f9'], phoenix: ['#fb923c', '#fde68a'],
  singularity: ['#a78bfa', '#fbbf24'], dragon: ['#f87171', '#fbbf24'], astral: ['#c084fc', '#e9d5ff'], eclipse: ['#fbbf24', '#e2e8f0'],
  signature: ['#d4af37', '#f8fafc'],
};
const honours: Record<number, [string, string]> = {
  0: ['Người bạn khởi đầu', 'First companion'], 1: ['Mầm xanh hy vọng', 'Fresh beginnings'], 2: ['Dấu ấn hồng ngọc', 'Rose signature'],
  3: ['Ánh sao rực rỡ', 'Starlight bearer'], 4: ['Kẻ du hành vũ trụ', 'Cosmic traveller'], 5: ['Phong cách đường phố', 'Street explorer'],
  6: ['Kẻ đón hoàng hôn', 'Sunset chaser'], 7: ['Người giữ rừng xanh', 'Forest keeper'], 8: ['Thủy thủ tự do', 'Free sailor'],
  9: ['Nhịp sáng Neon', 'Neon pulse'], 10: ['Lời hẹn hoa anh đào', 'Sakura promise'], 11: ['Lữ khách mùa đông', 'Winter wanderer'],
  12: ['Dòng dõi hoàng gia', 'Royal lineage'], 13: ['Người dẫn lối thiên hà', 'Celestial wayfarer'], 14: ['Hậu duệ phượng hoàng', 'Phoenix heir'],
  15: ['Chúa tể hố đen', 'Singularity sovereign'], 16: ['Người thức tỉnh long thần', 'Dragon awakener'],
  17: ['Linh hồn tinh tú', 'Astral soul'], 18: ['Người giữ nhật thực', 'Eclipse guardian'],
  20: ['Phong thái thanh lịch', 'Classic confidence'], 21: ['Nét duyên thanh lịch', 'Classic elegance'],
};
export function cosmeticHonour(item: Cosmetic, language: 'vi' | 'en') {
  const special: Partial<Record<CosmeticTheme, [string, string]>> = {
    comet: ['Sứ giả sao chổi', 'Comet herald'], aurora: ['Người dệt cực quang', 'Aurora weaver'], orbit: ['Kẻ chinh phục quỹ đạo', 'Orbit explorer'],
    signature: ['Dấu ấn độc quyền RoFinance', 'RoFinance exclusive signature'],
  };
  const names = special[cosmeticTheme(item)] || honours[item.variant] || honours[0];
  return names[language === 'en' ? 1 : 0];
}
/** Presentation only; this never grants equipment, awards or ranking points. */
export function equippedLegendary(equipped: Equipment): Cosmetic | undefined {
  const item = equippedAuraItem(equipped);
  return item?.rarity === 'legendary' ? item : undefined;
}
