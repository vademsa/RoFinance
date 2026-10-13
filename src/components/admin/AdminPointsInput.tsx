import React, { useLayoutEffect, useRef } from 'react';
import { formatAdminPoints, parseAdminPoints } from '../../utils/adminPointsInput';

/** Presentation-only grouping. The parent and backend still validate integer bounds. */
export function AdminPointsInput({ value, onChange, max, language }: {
  value: string; onChange: (digits: string) => void; max: number; language: 'vi' | 'en';
}) {
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const formatted = formatAdminPoints(value);
  useLayoutEffect(() => {
    const field = input.current;
    if (!field) return;
    const number = Number(value);
    field.setCustomValidity(value && (!Number.isSafeInteger(number) || number < 1 || number > max)
      ? language === 'vi' ? `Nhập số điểm từ 1 đến ${formatAdminPoints(String(max))}.` : `Enter points from 1 to ${formatAdminPoints(String(max))}.` : '');
    if (caret.current !== null) {
      let position = 0; let count = 0;
      while (position < formatted.length && count < caret.current) { if (/\d/.test(formatted[position])) count++; position++; }
      field.setSelectionRange(position, position); caret.current = null;
    }
  }, [value, formatted, max, language]);
  return <input ref={input} required type="text" inputMode="numeric" autoComplete="off" value={formatted}
    onChange={event => {
      const text = event.target.value;
      if (!/^[\d.]*$/.test(text)) return;
      const digits = text.replace(/\./g, '').replace(/^0+(?=\d)/, '');
      if (digits.length > 16) return;
      caret.current = Math.min(digits.length, text.slice(0, event.target.selectionStart ?? text.length).replace(/\./g, '').length);
      onChange(digits);
    }}
    onPaste={event => {
      event.preventDefault();
      const digits = parseAdminPoints(event.clipboardData.getData('text'));
      if (digits === null) return;
      const field = event.currentTarget; const start = field.selectionStart ?? 0; const end = field.selectionEnd ?? start;
      const before = formatted.slice(0, start).replace(/\./g, ''); const after = formatted.slice(end).replace(/\./g, '');
      const next = (before + digits + after).replace(/^0+(?=\d)/, '');
      if (next.length > 16) return;
      caret.current = Math.min(next.length, before.length + digits.length); onChange(next);
    }}
    onKeyDown={event => {
      if (!event.ctrlKey && !event.metaKey && ['.', ',', '-', '+', 'e', 'E'].includes(event.key)) event.preventDefault();
      const field = event.currentTarget; const start = field.selectionStart ?? 0;
      if (field.selectionEnd !== start) return;
      // Deleting a separator removes the adjacent digit instead of restoring the
      // separator and leaving the cursor stuck at the same thousands boundary.
      const separator = event.key === 'Backspace' ? start - 1 : event.key === 'Delete' ? start : -1;
      if (separator < 0 || formatted[separator] !== '.') return;
      event.preventDefault();
      const count = formatted.slice(0, start).replace(/\./g, '').length;
      const index = event.key === 'Backspace' ? count - 1 : count;
      const next = (value.slice(0, index) + value.slice(index + 1)).replace(/^0+(?=\d)/, '');
      caret.current = Math.min(next.length, Math.max(0, index)); onChange(next);
    }}/>;
}
