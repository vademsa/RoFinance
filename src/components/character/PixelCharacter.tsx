import React from 'react';
import { CHARACTERS, COSMETICS, DEFAULT_EQUIPMENT, type CharacterId, type CharacterGender, type Equipment, type ItemSlot, type Mood } from '../../../shared/character';
import { CostumeDetails } from './CostumeDetails';
import { LegendaryAttachmentArtwork } from './LegendaryAttachment';
import { legendaryAttachment } from '../../utils/legendaryAttachments';

export function PixelCharacter({ characterId = 'sun', gender = 'male', equipped = DEFAULT_EQUIPMENT, mood = 'steady', size = 160, animated = false, title = 'Pixel character' }: {
  characterId?: CharacterId; gender?: CharacterGender; equipped?: Equipment; mood?: Mood; size?: number; animated?: boolean; title?: string;
}) {
  const skin = (CHARACTERS.find((item) => item.id === characterId) || CHARACTERS[0]).skin;
  const item = (slot: ItemSlot) => COSMETICS.find((entry) => entry.id === equipped[slot] && entry.slot === slot);
  const shirt = item('shirt'); const hair = item('hair'); const hat = item('hat'); const shoes = item('shoes');
  const backpack = item('backpack'); const face = item('face'); const expression = item('expression');
  const outline = '#25283d'; const hairColor = hair?.variant === 0 ? '#49382c' : hair?.color || '#49382c';
  const female = gender === 'female';
  const happy = mood === 'happy'; const anxious = mood === 'worried' || mood === 'attention';
  return <svg viewBox="0 0 64 80" width={size} height={size * 1.25} role="img" aria-label={title}
    className={`pixel-character ${animated ? 'pixel-character-animated' : ''}`} data-gender={gender} shapeRendering="crispEdges">
    <title>{title}</title>
    {female && <g data-gender-detail="female-base-hair">
      <path d="M20 23h5v26h-2v3h-3zM41 23h5v29h-3v-3h-2z" fill={outline}/>
      <path d="M21 24h3v25h-1v2h-2zM42 24h3v27h-2v-2h-1z" fill={hairColor}/>
    </g>}
    <g fill="#25283d" opacity=".15"><rect x="17" y="73" width="31" height="3"/><rect x="21" y="76" width="23" height="1"/></g>
    {backpack && <g data-slot="backpack">{legendaryAttachment(backpack) ? <LegendaryAttachmentArtwork item={backpack}/> : <><rect x="16" y="42" width="9" height="20" fill={outline}/><rect x="17" y="43" width="8" height="17" fill={backpack.color}/><rect x="14" y="46" width="6" height="13" fill={backpack.color}/><rect x="15" y="50" width="4" height="6" fill="#fff" opacity=".35"/>{backpack.variant > 1 && <rect x="16" y="45" width="2" height="2" fill="#fef3c7"/>}</>}</g>}
    <g data-slot="hair"><rect x="22" y="18" width="22" height={hair?.gender === 'male' ? 14 : 24} fill={outline}/><rect x="23" y="19" width="20" height={hair?.gender === 'male' ? 13 : 23} fill={hairColor}/>{hair?.variant === 1 && <><rect x="20" y="24" width="4" height="23" fill={hairColor}/><rect x="42" y="24" width="4" height="23" fill={hairColor}/></>}{hair?.variant === 2 && <rect x="40" y="14" width="8" height="8" fill={hairColor}/>}</g>
    <rect x="29" y="37" width="8" height="7" fill={skin}/>
    <g data-slot="shirt"><rect x="22" y="42" width="22" height="19" fill={outline}/><rect x="23" y="43" width="20" height="17" fill={shirt?.color || '#6366f1'}/><rect x="18" y="43" width="6" height="12" fill={shirt?.color || '#6366f1'}/><rect x="43" y="43" width="5" height="12" fill={shirt?.color || '#6366f1'}/><rect x="18" y="54" width="5" height="7" fill={skin}/><rect x="43" y="54" width="5" height="7" fill={skin}/><rect x="29" y="42" width="8" height="3" fill={skin}/>{shirt?.variant === 1 && <rect x="23" y="50" width="20" height="3" fill="#d1fae5"/>}{shirt?.variant === 2 && <><rect x="32" y="45" width="2" height="13" fill="#fff" opacity=".7"/><rect x="26" y="53" width="4" height="3" fill="#be185d"/></>}{shirt?.variant === 3 && <><rect x="30" y="49" width="6" height="6" fill="#fffbeb"/><rect x="32" y="47" width="2" height="10" fill="#fffbeb"/></>}</g>
    <rect x="23" y="60" width="9" height="11" fill="#334155"/><rect x="34" y="60" width="9" height="11" fill="#334155"/>
    {shirt?.variant === 4 && <g data-detail="aurora"><rect x="24" y="46" width="4" height="12" fill="#2dd4bf"/><rect x="28" y="48" width="5" height="9" fill="#a78bfa"/><rect x="33" y="46" width="5" height="10" fill="#f0abfc"/><rect x="38" y="48" width="4" height="9" fill="#67e8f9"/><rect x="32" y="44" width="2" height="15" fill="#e0f2fe"/></g>}
    {backpack?.variant === 4 && !legendaryAttachment(backpack) && <g data-detail="orbit"><rect x="11" y="47" width="7" height="12" fill="#312e81"/><rect x="9" y="50" width="11" height="6" fill="#a5b4fc"/><rect x="12" y="48" width="6" height="10" fill="#312e81"/><rect x="14" y="51" width="3" height="4" fill="#67e8f9"/><rect x="14" y="43" width="2" height="3" fill="#fbbf24"/></g>}
    <g data-slot="shoes"><rect x="21" y={shoes?.variant === 2 ? 65 : 69} width="11" height={shoes?.variant === 2 ? 8 : 4} fill={shoes?.color || '#6366f1'}/><rect x="34" y={shoes?.variant === 2 ? 65 : 69} width="12" height={shoes?.variant === 2 ? 8 : 4} fill={shoes?.color || '#6366f1'}/><rect x="21" y="73" width="11" height="1" fill={outline}/><rect x="34" y="73" width="12" height="1" fill={outline}/>{shoes?.variant !== 0 && <><rect x="24" y="69" width="4" height="1" fill="#fff"/><rect x="37" y="69" width="4" height="1" fill="#fff"/></>}</g>
    <g data-slot="face" data-base-face={gender}>
      {female ? <g fill={skin}><rect x="24" y="23" width="18" height="14"/><rect x="23" y="28" width="1" height="5"/><rect x="42" y="28" width="1" height="5"/><rect x="25" y="21" width="16" height="4"/><rect x="25" y="37" width="16" height="2"/><rect x="27" y="39" width="12" height="2"/></g>
        : <><rect x="23" y="23" width="20" height="16" fill={skin}/><rect x="21" y="28" width="2" height="6" fill={skin}/><rect x="43" y="28" width="2" height="6" fill={skin}/><rect x="25" y="21" width="16" height="4" fill={skin}/><rect x="25" y="38" width="16" height="3" fill={skin}/></>}
      {face?.variant === 1 && <><rect x="26" y="28" width="4" height="4" fill="#fff"/><rect x="36" y="28" width="4" height="4" fill="#fff"/></>}
      <rect x="27" y={happy && expression?.variant === 2 ? 29 : 28} width="2" height={happy && expression?.variant === 2 ? 1 : 3} fill={face?.variant === 3 ? '#92400e' : outline}/><rect x="37" y={happy && expression?.variant === 2 ? 29 : 28} width="2" height={happy && expression?.variant === 2 ? 1 : 3} fill={face?.variant === 3 ? '#92400e' : outline}/>
      {face?.variant === 2 && <><rect x="24" y="33" width="3" height="1" fill="#c87968"/><rect x="39" y="33" width="3" height="1" fill="#c87968"/></>}
    </g>
    <g data-slot="expression" data-mood={mood} fill={outline}>
      {anxious ? <><rect x="30" y="36" width="7" height="1"/><rect x="29" y="37" width="2" height="1"/><rect x="36" y="37" width="2" height="1"/><rect x="26" y="25" width="4" height="1"/><rect x="36" y="25" width="4" height="1"/></> : happy ? <><rect x="29" y="34" width="2" height="2"/><rect x="36" y="34" width="2" height="2"/><rect x="31" y="36" width="5" height={expression?.variant === 1 ? 2 : 1}/>{expression?.variant === 3 && <><rect x="24" y="33" width="3" height="2" fill="#ef8f8f"/><rect x="40" y="33" width="2" height="2" fill="#ef8f8f"/></>}</> : <rect x="30" y="35" width="7" height="1"/>}
      {expression?.variant === 1 && !happy && <rect x="31" y={anxious ? 35 : 36} width="5" height="2"/>}
      {expression?.variant === 2 && !happy && <><rect x="26" y="26" width="4" height="1"/><rect x="36" y="26" width="4" height="1"/>{anxious && <rect x="42" y="27" width="2" height="4" fill="#38bdf8"/>}</>}
      {expression?.variant === 3 && !happy && <><rect x="24" y="33" width="3" height="2" fill="#ef8f8f"/><rect x="40" y="33" width="2" height="2" fill="#ef8f8f"/></>}
    </g>
    <g fill={hairColor}><rect x="23" y="20" width="20" height="3"/><rect x="23" y="22" width={hair?.variant === 3 ? 3 : 7} height="4"/><rect x="40" y="22" width="3" height="4"/>{hair?.variant === 3 && <><rect x="26" y="17" width="4" height="4"/><rect x="34" y="16" width="4" height="4"/></>}</g>
    {[backpack, shirt, shoes, face, expression, hair].map((cosmetic) => cosmetic && !legendaryAttachment(cosmetic) && <CostumeDetails key={cosmetic.id} item={cosmetic}/>)}
    {female && <>
      <g data-gender-detail="female-face">
        <path d="M26 28h1v1h-1zM39 28h1v1h-1z" fill={outline}/>
        <path d="M25 33h3v2h-3zM38 33h3v2h-3z" fill="#e797a4" opacity=".75"/>
      </g>
      <g data-gender-detail="female-front-hair" fill={hairColor}>
        <path d="M23 22h7v2h-4v3h-2v8h-1zM40 22h3v26h-2V28h-1zM21 34h3v14h-1v2h-2z"/>
      </g>
    </>}
    {hat && <g data-slot="hat" fill={hat.color}>{hat.gender ? null : legendaryAttachment(hat) ? <LegendaryAttachmentArtwork item={hat}/> : hat.variant === 3 ? <><rect x="20" y="18" width="27" height="3"/><rect x="25" y="13" width="16" height="5"/><rect x="28" y="8" width="10" height="5"/><rect x="31" y="5" width="4" height="3"/><rect x="31" y="14" width="3" height="3" fill="#fffbeb"/></> : <><rect x="23" y="15" width="20" height="7"/><rect x="25" y="13" width="16" height="2"/><rect x={hat.variant === 0 ? 18 : 21} y="21" width={hat.variant === 0 ? 25 : 24} height="2"/>{hat.variant === 2 && <rect x="30" y="9" width="6" height="5"/>}{hat.variant === 1 && <rect x="23" y="19" width="20" height="2" fill="#d1fae5"/>}</>}</g>}
    {!legendaryAttachment(hat) && <CostumeDetails item={hat}/>}
    {hat?.variant === 4 && !legendaryAttachment(hat) && <g data-detail="comet"><rect x="23" y="12" width="4" height="7" fill="#c4b5fd"/><rect x="31" y="9" width="4" height="10" fill="#c4b5fd"/><rect x="39" y="12" width="4" height="7" fill="#c4b5fd"/><rect x="32" y="7" width="2" height="6" fill="#fef3c7"/><rect x="30" y="9" width="6" height="2" fill="#fef3c7"/><rect x="45" y="6" width="2" height="2" fill="#67e8f9"/><rect x="48" y="4" width="2" height="2" fill="#c4b5fd"/></g>}
  </svg>;
}
