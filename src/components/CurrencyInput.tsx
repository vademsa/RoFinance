import React, { useEffect, useState } from 'react';
import {
  convertDisplayToVnd,
  convertVndForDisplay,
  getDisplayLocale,
  getRuntimePreferences,
} from '../lib/preferences';

interface CurrencyInputProps {
  value: number | '';
  onValueChange: (value: number | '') => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
  min?: number;
  id?: string;
  name?: string;
  disabled?: boolean;
  hideAmount?: boolean;
}

const formatCurrency = (value: number | '') =>
  value === ''
    ? ''
    : Math.max(0, convertVndForDisplay(value)).toLocaleString(
        getRuntimePreferences().language === 'en' ? 'en-US' : 'vi-VN', {
        maximumFractionDigits: 2,
      });

function parseCurrencyInput(rawValue: string) {
  const cleaned = rawValue.replace(/[^\d.,]/g, '');
  if (!cleaned) return { display: '', value: '' as const };

  const separators = [...cleaned].reduce<number[]>((positions, character, index) => {
    if (character === '.' || character === ',') positions.push(index);
    return positions;
  }, []);
  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');
  const lastSeparatorIndex = separators.at(-1) ?? -1;
  const digitsAfterLastSeparator =
    lastSeparatorIndex >= 0 ? cleaned.slice(lastSeparatorIndex + 1).replace(/\D/g, '') : '';

  let decimalSeparatorIndex = -1;
  if (hasDot && hasComma) {
    decimalSeparatorIndex = lastSeparatorIndex;
  } else if (separators.length > 1 && digitsAfterLastSeparator.length <= 2) {
    decimalSeparatorIndex = lastSeparatorIndex;
  } else if (
    separators.length === 1 &&
    (digitsAfterLastSeparator.length === 0 || digitsAfterLastSeparator.length <= 2)
  ) {
    decimalSeparatorIndex = lastSeparatorIndex;
  }

  const integerSource =
    decimalSeparatorIndex >= 0 ? cleaned.slice(0, decimalSeparatorIndex) : cleaned;
  const integerDigits = integerSource.replace(/\D/g, '').replace(/^0+(?=\d)/, '') || '0';
  const fractionDigits =
    decimalSeparatorIndex >= 0
      ? cleaned.slice(decimalSeparatorIndex + 1).replace(/\D/g, '').slice(0, 2)
      : '';
  const hasTrailingDecimalSeparator =
    decimalSeparatorIndex >= 0 && cleaned.slice(decimalSeparatorIndex + 1).replace(/\D/g, '') === '';

  const locale = getDisplayLocale();
  const decimalMark = locale === 'en-US' ? '.' : ',';
  const groupedInteger = Number(integerDigits).toLocaleString(locale);
  const display =
    decimalSeparatorIndex >= 0
      ? `${groupedInteger}${decimalMark}${fractionDigits}`
      : groupedInteger;
  const numericValue = Number(`${integerDigits}.${fractionDigits || '0'}`);

  return {
    display: hasTrailingDecimalSeparator ? `${groupedInteger}${decimalMark}` : display,
    value: Number.isFinite(numericValue) ? numericValue : Number.MAX_SAFE_INTEGER,
  };
}

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value,
  onValueChange,
  className,
  placeholder,
  required,
  min,
  id,
  name,
  disabled,
  hideAmount = false,
}) => {
  const preferences = getRuntimePreferences();
  const [displayValue, setDisplayValue] = useState(() => formatCurrency(value));

  useEffect(() => {
    setDisplayValue(formatCurrency(value));
  }, [preferences.currency, preferences.language, preferences.usdVndRate, value]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseCurrencyInput(event.target.value);
    setDisplayValue(parsed.display);
    onValueChange(parsed.value === '' ? '' : convertDisplayToVnd(parsed.value));
  };

  return (
    <input
      id={id}
      name={name}
      type={hideAmount ? 'password' : 'text'}
      inputMode="numeric"
      autoComplete="off"
      value={displayValue}
      onChange={handleChange}
      onBlur={() => setDisplayValue(formatCurrency(value))}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      aria-valuemin={min}
      className={className}
    />
  );
};
