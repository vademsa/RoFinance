import type { Cosmetic } from '../../shared/character';

export type LegendaryAttachment = 'angel-wings' | 'phoenix-wings' | 'orbital-wings' | 'dragon-wings'
  | 'angel-halo' | 'phoenix-halo' | 'comet-halo' | 'singularity-halo';

// Visual upgrades of existing items, not new inventory entries or equipment slots.
const attachments: Record<string, { slot: 'hat' | 'backpack'; shape: LegendaryAttachment }> = {
  'backpack-celestial': { slot: 'backpack', shape: 'angel-wings' },
  'backpack-phoenix': { slot: 'backpack', shape: 'phoenix-wings' },
  'backpack-orbit': { slot: 'backpack', shape: 'orbital-wings' },
  'backpack-dragon': { slot: 'backpack', shape: 'dragon-wings' },
  'hat-celestial': { slot: 'hat', shape: 'angel-halo' },
  'hat-phoenix': { slot: 'hat', shape: 'phoenix-halo' },
  'hat-comet': { slot: 'hat', shape: 'comet-halo' },
  'hat-singularity': { slot: 'hat', shape: 'singularity-halo' },
};

export function legendaryAttachment(item?: Cosmetic): LegendaryAttachment | undefined {
  if (!item || item.rarity !== 'legendary') return undefined;
  const attachment = attachments[item.id];
  return attachment?.slot === item.slot ? attachment.shape : undefined;
}

export function attachmentViewBox(item: Cosmetic): string | undefined {
  if (!legendaryAttachment(item)) return undefined;
  return item.slot === 'backpack' ? '0 18 64 54' : '9 0 48 18';
}
