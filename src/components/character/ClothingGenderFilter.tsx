import React from 'react';
import type { CosmeticGender } from '../../../shared/character';
import { genderLabels, label, type CharacterLanguage } from './characterText';

export function ClothingGenderFilter({ value, onChange, language }: {
  value: CosmeticGender | ''; onChange: (value: CosmeticGender | '') => void; language: CharacterLanguage;
}) {
  return <label className="character-form-label">{language === 'vi' ? 'Lọc trang phục Nam/Nữ' : 'Filter clothing style'}
    <select className="character-select" aria-label={language === 'vi' ? 'Lọc trang phục Nam/Nữ' : 'Filter clothing style'} value={value} onChange={event => onChange(event.target.value as CosmeticGender | '')}>
      <option value="">{language === 'vi' ? 'Tất cả kiểu dáng' : 'All styles'}</option>
      {(['male', 'female', 'unisex'] as const).map(gender => <option key={gender} value={gender}>{label(genderLabels[gender], language)}</option>)}
    </select>
  </label>;
}
