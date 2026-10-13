import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CharacterLanguage } from './characterText';

export function CollectionPagination({ page, totalPages, total, first, last, onPage, language, label }: {
  page: number; totalPages: number; total: number; first: number; last: number;
  onPage: (page: number) => void; language: CharacterLanguage; label: string;
}) {
  const t = (vi: string, en: string) => language === 'en' ? en : vi;
  return <nav className="character-pagination" aria-label={label}>
    <span className="character-muted">{first}–{last} / {total} {t('vật phẩm', 'items')}</span>
    <div><button type="button" className="character-button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('Trang trước', 'Previous page')}><ChevronLeft size={16}/></button>
      <span role="status" aria-live="polite">{t('Trang', 'Page')} {page} / {totalPages}</span>
      <button type="button" className="character-button" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label={t('Trang sau', 'Next page')}><ChevronRight size={16}/></button></div>
  </nav>;
}
