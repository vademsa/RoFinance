export const CATEGORY_ICON_KEYS = [
  'utensils', 'coffee', 'shopping-basket', 'house', 'zap', 'droplets', 'wifi',
  'fuel', 'parking', 'taxi', 'heart-pulse', 'shield', 'baby', 'wrench', 'sofa',
  'plane', 'shopping-bag', 'gamepad', 'sparkles', 'dumbbell', 'party', 'hotel',
  'chart', 'piggy-bank', 'coins', 'building', 'landmark', 'briefcase', 'book',
  'graduation', 'presentation', 'pencil-ruler', 'gift', 'hand-heart', 'credit-card',
  'banknote', 'receipt', 'wallet', 'badge-dollar', 'trending-up', 'rotate-ccw', 'tag',
] as const;

export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];
