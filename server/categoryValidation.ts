import { CATEGORY_ICON_KEYS, type CategoryIconKey } from '../shared/category';

export interface StoredCustomCategory {
  id: string;
  name: string;
  type: 'expense' | 'income';
  icon: CategoryIconKey;
  jarCode?: string;
  isCustom: true;
  createdAt: string;
}

const iconKeys = new Set<string>(CATEGORY_ICON_KEYS);
const normalizeKey = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLowerCase();

export function validateCustomCategories(
  rawCategories: unknown,
): { value?: StoredCustomCategory[]; error?: string } {
  if (!Array.isArray(rawCategories)) return { error: 'Danh mục tùy chỉnh không hợp lệ' };
  if (rawCategories.length > 100) return { error: 'Mỗi tài khoản được tạo tối đa 100 danh mục riêng' };

  const result: StoredCustomCategory[] = [];
  const seen = new Set<string>();
  const seenIds = new Set<string>();
  for (const rawCategory of rawCategories) {
    if (!rawCategory || typeof rawCategory !== 'object') {
      return { error: 'Danh mục tùy chỉnh không hợp lệ' };
    }
    const category = rawCategory as Record<string, unknown>;
    if (typeof category.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(category.id)) {
      return { error: 'Mã danh mục không hợp lệ' };
    }
    if (seenIds.has(category.id)) return { error: 'Mã danh mục bị trùng' };
    seenIds.add(category.id);
    if (typeof category.name !== 'string') return { error: 'Tên danh mục không hợp lệ' };
    const name = category.name.trim().replace(/\s+/g, ' ');
    if (!name || Array.from(name).length > 50 || /[\u0000-\u001f\u007f]/.test(name)) {
      return { error: 'Tên danh mục phải từ 1 đến 50 ký tự' };
    }
    if (category.type !== 'expense' && category.type !== 'income') {
      return { error: 'Loại danh mục không hợp lệ' };
    }
    if (typeof category.icon !== 'string' || !iconKeys.has(category.icon)) {
      return { error: 'Icon danh mục không hợp lệ' };
    }

    let jarCode: string | undefined;
    if (category.type === 'expense') {
      if (typeof category.jarCode !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(category.jarCode)) {
        return { error: 'Hũ liên kết với danh mục không hợp lệ' };
      }
      jarCode = category.jarCode;
    }
    const createdAt = typeof category.createdAt === 'string' && Number.isFinite(Date.parse(category.createdAt))
      ? new Date(category.createdAt).toISOString()
      : new Date().toISOString();
    const duplicateKey = `${category.type}:${jarCode || '*'}:${normalizeKey(name)}`;
    if (seen.has(duplicateKey)) return { error: `Danh mục “${name}” bị trùng` };
    seen.add(duplicateKey);

    result.push({
      id: category.id,
      name,
      type: category.type,
      icon: category.icon as CategoryIconKey,
      ...(jarCode ? { jarCode } : {}),
      isCustom: true,
      createdAt,
    });
  }
  return { value: result };
}
