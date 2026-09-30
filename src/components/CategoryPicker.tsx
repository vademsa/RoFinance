import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Pencil, Plus, Search, Settings2, X } from 'lucide-react';
import type { TransactionCategory } from '../types';
import type { CategoryIconKey } from '../../shared/category';
import { CategoryIcon } from './CategoryIcon';
import { getTransactionCategories } from '../constants/categories';
import { getRuntimePreferences } from '../lib/preferences';
import { localizeText } from './TranslationLayer';

const ICON_CHOICES: { key: CategoryIconKey; label: string }[] = [
  { key: 'utensils', label: 'Ăn uống' },
  { key: 'coffee', label: 'Đồ uống' },
  { key: 'shopping-basket', label: 'Đi chợ' },
  { key: 'house', label: 'Nhà ở' },
  { key: 'taxi', label: 'Di chuyển' },
  { key: 'heart-pulse', label: 'Sức khỏe' },
  { key: 'shopping-bag', label: 'Mua sắm' },
  { key: 'plane', label: 'Du lịch' },
  { key: 'book', label: 'Học tập' },
  { key: 'gift', label: 'Quà tặng' },
  { key: 'hand-heart', label: 'Cho đi' },
  { key: 'credit-card', label: 'Thanh toán' },
  { key: 'piggy-bank', label: 'Tiết kiệm' },
  { key: 'chart', label: 'Đầu tư' },
  { key: 'briefcase', label: 'Công việc' },
  { key: 'sparkles', label: 'Cá nhân' },
  { key: 'receipt', label: 'Hóa đơn' },
  { key: 'tag', label: 'Khác' },
];

const normalizeForComparison = (value: string) => value
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLocaleLowerCase('vi-VN');

interface CategoryPickerProps {
  categories: TransactionCategory[];
  customCategories: TransactionCategory[];
  value: string;
  type: 'expense' | 'income';
  jarCode?: string;
  onChange: (category: TransactionCategory) => void;
  onAddCategory: (category: TransactionCategory) => void;
  onUpdateCategory: (category: TransactionCategory) => void;
}

export function CategoryPicker({
  categories,
  customCategories,
  value,
  type,
  jarCode,
  onChange,
  onAddCategory,
  onUpdateCategory,
}: CategoryPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isManaging, setIsManaging] = useState(false);
  const [editingCategory, setEditingCategory] = useState<TransactionCategory | null>(null);
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState<CategoryIconKey>('tag');
  const [error, setError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const selected = categories.find((category) => category.name === value) || categories[0];
  const language = getRuntimePreferences().language;

  useEffect(() => {
    if (isOpen && !isAdding) searchRef.current?.focus();
  }, [isAdding, isOpen]);

  const filteredCategories = useMemo(() => {
    const query = normalizeForComparison(search);
    return query
      ? categories.filter((category) => (
          normalizeForComparison(category.name).includes(query)
          || (language === 'en' && !category.isCustom
            && normalizeForComparison(localizeText(category.name, 'en')).includes(query))
        ))
      : categories;
  }, [categories, language, search]);

  const closePicker = () => {
    setIsOpen(false);
    setIsAdding(false);
    setIsManaging(false);
    setEditingCategory(null);
    setSearch('');
    setNewName('');
    setNewIcon('tag');
    setError('');
  };

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) closePicker();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePicker();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const beginCreate = () => {
    setEditingCategory(null);
    setNewName(search);
    setNewIcon('tag');
    setIsManaging(false);
    setIsAdding(true);
    setError('');
  };

  const beginEdit = (category: TransactionCategory) => {
    setEditingCategory(category);
    setNewName(category.name);
    setNewIcon(category.icon as CategoryIconKey);
    setIsManaging(true);
    setIsAdding(true);
    setError('');
  };

  const cancelEditor = () => {
    setIsAdding(false);
    setEditingCategory(null);
    setNewName('');
    setNewIcon('tag');
    setError('');
  };

  const addCategory = () => {
    const name = newName.trim().replace(/\s+/g, ' ');
    if (!name) {
      setError('Vui lòng nhập tên danh mục.');
      return;
    }
    if (Array.from(name).length > 50 || /[\u0000-\u001f\u007f]/.test(name)) {
      setError('Tên danh mục tối đa 50 ký tự và không chứa ký tự điều khiển.');
      return;
    }
    if (!editingCategory && customCategories.length >= 100) {
      setError('Mỗi tài khoản được tạo tối đa 100 danh mục riêng.');
      return;
    }

    const categoryType = editingCategory?.type || type;
    const categoryJarCode = categoryType === 'expense' ? (editingCategory?.jarCode || jarCode) : undefined;
    const categoriesInScope = getTransactionCategories(categoryType, categoryJarCode, customCategories);
    if (categoriesInScope.some((category) => (
      category.id !== editingCategory?.id
      && normalizeForComparison(category.name) === normalizeForComparison(name)
    ))) {
      setError('Danh mục này đã tồn tại trong nhóm hiện tại.');
      return;
    }

    if (editingCategory) {
      const updatedCategory: TransactionCategory = {
        ...editingCategory,
        name,
        icon: newIcon,
      };
      const isCurrentSelection = selected?.id === editingCategory.id;
      onUpdateCategory(updatedCategory);
      if (isCurrentSelection) onChange(updatedCategory);
      cancelEditor();
      return;
    }

    const randomId = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const category: TransactionCategory = {
      id: `custom-${randomId}`,
      name,
      type,
      icon: newIcon,
      jarCode: type === 'expense' ? jarCode : undefined,
      isCustom: true,
      createdAt: new Date().toISOString(),
    };
    onAddCategory(category);
    onChange(category);
    closePicker();
  };

  return (
    <div ref={pickerRef} data-ui="category-picker" className="space-y-2">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="transaction-category-panel"
        onClick={() => setIsOpen((open) => !open)}
        data-ui="category-picker-trigger"
        className="flex w-full cursor-pointer items-center gap-2 rounded-2xl border border-zinc-700 bg-[#121214] p-3 text-left text-xs font-semibold text-white transition-colors hover:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-300">
          <CategoryIcon name={selected?.icon} />
        </span>
        <span data-no-translate={selected?.isCustom ? 'true' : undefined} className="min-w-0 flex-1 truncate">
          {selected?.name || 'Chọn danh mục'}
        </span>
        <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div id="transaction-category-panel" data-ui="category-picker-panel" className="rounded-2xl border border-zinc-700 bg-[#101012] p-3 shadow-xl">
          {!isAdding && !isManaging ? (
            <div className="space-y-3">
              <label className="relative block">
                <span className="sr-only">Tìm danh mục</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tìm danh mục..."
                  className="w-full rounded-xl border border-zinc-800 bg-[#18181b] py-2.5 pl-9 pr-3 text-xs text-white outline-none focus:border-indigo-500"
                />
              </label>

              <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                {filteredCategories.map((category) => (
                  <div
                    key={category.id}
                    data-ui="category-picker-option"
                    data-selected={category.name === value ? 'true' : 'false'}
                    className={`flex items-center rounded-xl border transition-colors ${category.name === value ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-200' : 'border-zinc-800 bg-[#18181b] text-zinc-300 hover:border-zinc-700 hover:text-white'}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onChange(category);
                        closePicker();
                      }}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    >
                      <CategoryIcon name={category.icon} className="h-3.5 w-3.5 shrink-0" />
                      <span data-no-translate={category.isCustom ? 'true' : undefined} className="min-w-0 flex-1 truncate">{category.name}</span>
                      {category.name === value && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                    {category.isCustom && (
                      <button
                        type="button"
                        aria-label={`Chỉnh sửa danh mục ${category.name}`}
                        title="Chỉnh sửa danh mục"
                        onClick={() => beginEdit(category)}
                        className="mr-1 cursor-pointer rounded-lg p-1.5 text-zinc-500 hover:bg-indigo-500/15 hover:text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {filteredCategories.length === 0 && (
                <p className="py-3 text-center text-[11px] text-zinc-500">Không tìm thấy danh mục phù hợp.</p>
              )}

              <button
                type="button"
                onClick={beginCreate}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-500/40 bg-indigo-500/5 py-2.5 text-xs font-bold text-indigo-300 transition-colors hover:bg-indigo-500/10 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              >
                <Plus className="h-4 w-4" /> Thêm danh mục của riêng bạn
              </button>
              {customCategories.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setIsManaging(true);
                    setSearch('');
                  }}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl py-2 text-[11px] font-bold text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                  <Settings2 className="h-3.5 w-3.5" /> Quản lý danh mục đã tạo ({customCategories.length})
                </button>
              )}
            </div>
          ) : !isAdding ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Quay lại chọn danh mục"
                  onClick={() => setIsManaging(false)}
                  className="cursor-pointer rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0">
                  <h3 className="text-xs font-black text-white">Danh mục của bạn</h3>
                  <p className="mt-0.5 text-[10px] text-zinc-500">Chọn bút chì để đổi tên hoặc icon.</p>
                </div>
              </div>

              <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {customCategories.map((category) => (
                  <div key={category.id} className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-[#18181b] px-2.5 py-2">
                    <CategoryIcon name={category.icon} className="h-4 w-4 shrink-0 text-indigo-300" />
                    <div className="min-w-0 flex-1">
                      <p data-no-translate="true" className="truncate text-[11px] font-bold text-zinc-200">{category.name}</p>
                      <p className="text-[9px] text-zinc-500">
                        {category.type === 'income' ? 'Khoản thu' : `Khoản chi · Hũ ${category.jarCode || 'khác'}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Chỉnh sửa danh mục ${category.name}`}
                      onClick={() => beginEdit(category)}
                      className="cursor-pointer rounded-lg p-2 text-zinc-500 hover:bg-indigo-500/15 hover:text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="rounded-xl bg-zinc-900/70 px-3 py-2 text-[10px] leading-relaxed text-zinc-500">
                Việc chỉnh sửa không làm thay đổi tên và icon đã lưu trong các giao dịch cũ.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-black text-white">{editingCategory ? 'Chỉnh sửa danh mục' : 'Danh mục mới'}</h3>
                  <p className="mt-0.5 text-[10px] text-zinc-500">
                    {(editingCategory?.type || type) === 'income'
                      ? 'Áp dụng cho các khoản thu'
                      : `Áp dụng cho hũ ${editingCategory?.jarCode || jarCode || ''}`}
                  </p>
                </div>
                <button type="button" aria-label="Hủy chỉnh sửa danh mục" onClick={cancelEditor} className="cursor-pointer rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <label className="block space-y-1.5">
                <span className="text-[11px] font-bold text-zinc-300">Tên danh mục</span>
                <input
                  autoFocus
                  value={newName}
                  onChange={(event) => {
                    setNewName(event.target.value);
                    setError('');
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    event.stopPropagation();
                    addCategory();
                  }}
                  maxLength={50}
                  placeholder="Ví dụ: Ăn khuya"
                  className="w-full rounded-xl border border-zinc-700 bg-[#18181b] px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500"
                />
              </label>

              <fieldset>
                <legend className="mb-2 text-[11px] font-bold text-zinc-300">Chọn icon</legend>
                <div className="grid max-h-40 grid-cols-6 gap-1.5 overflow-y-auto pr-1">
                  {ICON_CHOICES.map((choice) => (
                    <button
                      key={choice.key}
                      type="button"
                      title={choice.label}
                      aria-label={`Icon ${choice.label}`}
                      aria-pressed={newIcon === choice.key}
                      onClick={() => setNewIcon(choice.key)}
                      className={`flex aspect-square cursor-pointer items-center justify-center rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${newIcon === choice.key ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300' : 'border-zinc-800 bg-[#18181b] text-zinc-500 hover:border-zinc-700 hover:text-white'}`}
                    >
                      <CategoryIcon name={choice.key} />
                    </button>
                  ))}
                </div>
              </fieldset>

              {error && <p role="alert" className="text-[11px] font-semibold text-rose-400">{error}</p>}
              <button type="button" onClick={addCategory} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white transition-colors hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/60">
                {editingCategory ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editingCategory ? 'Lưu thay đổi' : 'Tạo và chọn danh mục'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
