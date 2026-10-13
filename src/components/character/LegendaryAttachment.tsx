import React from 'react';
import type { Cosmetic } from '../../../shared/character';
import { legendaryAttachment } from '../../utils/legendaryAttachments';

/** Same pixel silhouette in the catalogue, reward reel and equipped character. */
export function LegendaryAttachmentArtwork({ item }: { item: Cosmetic }) {
  const shape = legendaryAttachment(item);
  if (!shape) return null;
  const wing = shape.endsWith('-wings');
  const outline = '#25283d';
  let art: React.ReactNode;
  if (shape === 'angel-wings') {
    art = <>
      <path d="M29 43h-4v-5h-4v-5h-4v-4h-4v-3H7v-3H3v17h3v9h4v8h4v6h5v4h6V57h4z" fill={outline}/>
      <path d="M27 44h-4v-5h-4v-5h-4v-4h-4v-2H5v11h3v9h4v8h4v6h5v3h2V55h4z" fill="#e0f2fe"/>
      <path d="M5 28h2v10h3v9h4v7h4v7h3v3h-2v-3h-3v-5h-4v-8H8v-9H5z" fill="#67e8f9"/>
      <path d="M10 31h3v10h3v9h4v8h3v-5h-2v-6h-3v-8h-3v-6h-2v-2zM17 37h3v6h3v7h2v4h-3v-4h-3v-7h-2z" fill="#818cf8"/>
      <path d="M7 28h2v9H7zM12 32h2v6h-2zM17 38h2v5h-2zM21 45h2v6h-2z" fill="#fff"/>
      <path d="M25 44h3v9h-3zM22 50h3v9h-3z" fill="#bae6fd"/>
    </>;
  } else if (shape === 'phoenix-wings') {
    art = <>
      <path d="M29 45h-5v-7h-5v-6h-4v-8h-4v-5H7v5H4v8H2v12h3v10h4v7h5v6h6v4h6V57h3z" fill="#7c2d12"/>
      <path d="M27 46h-5v-7h-5v-6h-4v-7h-3v-4H9v5H6v7H4v9h3v10h4v7h5v5h6v3h2V55h3z" fill="#ea580c"/>
      <path d="M8 28h3v9h4v9h4v9h4v8h-3v-5h-5v-6h-4v-9H8zM17 36h3v7h4v8h-3v-5h-4z" fill="#fbbf24"/>
      <path d="M10 31h1v6h4v9h4v8h-2v-6h-4v-9h-3zM19 40h2v5h-2z" fill="#fef3c7"/>
      <path d="M5 44h2v9H5zM10 54h2v6h-2zM16 62h3v4h-3zM22 65h2v3h-2z" fill="#fb7185"/>
      <path d="M4 22h2v3H4zM1 31h2v2H1zM11 19h2v3h-2z" fill="#fde68a"/>
    </>;
  } else if (shape === 'dragon-wings') {
    art = <>
      <path d="M29 44h-5v-6h-4v-6h-4v-7h-4v-5H8v5H5v9H2v24h4v-4h5v3h5v6h5v5h6V55h2z" fill={outline}/>
      <path d="M25 44h-3v-6h-4v-6h-4v-7h-4v3H7v8H4v17h3v-2h6v4h5v5h5v5h2V53h2v-7h-2z" fill="#991b1b"/>
      <path d="M9 28h3v7h4v6h4v7h5v3h-8v-3h-5v-5H8v-4H5v-3h4z" fill="#f87171"/>
      <path d="M10 25h2v10h4v6h4v7h6v2h-8v-7h-4v-7h-4z" fill="#fbbf24"/>
      <path d="M10 36h2v18h-2zM17 43h2v17h-2zM24 50h2v14h-2z" fill="#450a0a"/>
      <path d="M8 21h2v6H8zM4 52h3v3H4zM16 57h3v4h-3zM24 64h2v3h-2z" fill="#fef3c7"/>
    </>;
  } else if (shape === 'orbital-wings') {
    art = <>
      <path d="M29 44h-6v-6h-5v-7h-5v-6H5v17h4v8h4v8h5v7h8V54h3z" fill="#312e81"/>
      <path d="M7 27h4v7h5v8h-4v-4H7zM11 42h7v5h4v5h-7v-4h-4zM16 52h7v7h-3v3h-2v-5h-2z" fill="#a78bfa"/>
      <path d="M8 29h2v6H8zM13 36h2v4h-2zM12 44h4v2h-4zM17 48h3v2h-3zM18 54h3v4h-3z" fill="#67e8f9"/>
      <path d="M24 40h3v13h-3zM20 60h4v3h-4z" fill="#e9d5ff"/>
      <path d="M2 40h2v2H2zM8 55h3v3H8zM15 64h2v2h-2zM19 22h2v2h-2zM1 26h2v2H1z" fill="#fef3c7"/>
      <path d="M3 46h6v2H3zM5 44h2v6H5z" fill="#67e8f9"/>
    </>;
  } else if (shape === 'angel-halo') {
    art = <>
      <path d="M24 3h16v2h6v2h4v5h-4v2h-6v2H24v-2h-6v-2h-4V7h4V5h6zM24 7v2h-5v1h5v2h16v-2h5V9h-5V7z" fill="#fbbf24" fillRule="evenodd"/>
      <path d="M24 3h16v2H24zM18 5h6v2h-6zM14 7h4v3h-4zM40 5h6v2h-6z" fill="#fff7d6"/>
      <path d="M24 14h16v2H24zM18 12h6v2h-6zM40 12h6v2h-6z" fill="#c68b26"/>
      <path d="M11 3h2v5h-2zM9 5h6v1H9zM52 12h2v5h-2zM50 14h6v1h-6z" fill="#67e8f9"/>
    </>;
  } else if (shape === 'phoenix-halo') {
    art = <>
      <path d="M22 3h20v2h6v3h3v4h-3v3h-6v2H22v-2h-6v-3h-3V8h3V5h6zM22 8v1h-5v2h5v1h20v-1h5V9h-5V8z" fill="#ea580c" fillRule="evenodd"/>
      <path d="M22 5h20v2H22zM16 8h4v4h-4zM44 8h4v4h-4zM22 13h20v2H22z" fill="#fde68a"/>
      <path d="M30 0h4v3h-4zM22 1h2v2h-2zM40 1h2v2h-2zM10 6h3v2h-3zM51 6h3v2h-3zM14 15h2v2h-2zM48 15h2v2h-2z" fill="#fbbf24"/>
      <path d="M26 5h12v1H26zM23 14h18v1H23z" fill="#fff7ed"/>
    </>;
  } else if (shape === 'comet-halo') {
    art = <>
      <path d="M35 2h12v2h5v6h-5v3h-9v2H25v2H14v-2h-3V9h5V6h8V4h11zM35 6v1H24v2h-8v3h9v-1h13V9h9V6z" fill="#a78bfa" fillRule="evenodd"/>
      <path d="M35 2h12v2H35zM24 4h11v2H24zM16 6h8v2h-8zM11 9h3v4h-3z" fill="#e9d5ff"/>
      <path d="M25 13h13v2H25zM38 11h9v2h-9zM47 8h5v2h-5z" fill="#67e8f9"/>
      <path d="M49 1h2v6h-2zM47 3h6v2h-6zM13 13h2v5h-2zM11 15h6v1h-6z" fill="#fef3c7"/>
      <path d="M53 3h3v1h-3zM24 1h2v2h-2zM40 16h2v2h-2z" fill="#f0abfc"/>
    </>;
  } else {
    art = <>
      <path d="M23 2h18v2h6v2h5v7h-5v2h-6v2H23v-2h-6v-2h-5V6h5V4h6zM23 6v2h-7v3h7v2h18v-2h7V8h-7V6z" fill="#7c3aed" fillRule="evenodd"/>
      <path d="M23 2h18v2H23zM17 4h6v2h-6zM12 6h4v4h-4zM41 4h6v2h-6z" fill="#ddd6fe"/>
      <path d="M23 15h18v2H23zM41 13h6v2h-6zM48 9h4v4h-4z" fill="#fbbf24"/>
      <path d="M25 7h14v5H25zM22 8h3v3h-3zM39 8h3v3h-3z" fill="#0f1026"/>
      <path d="M29 6h6v1h-6zM27 12h10v1H27zM10 1h2v2h-2zM53 15h2v2h-2z" fill="#fef3c7"/>
    </>;
  }
  return <g data-attachment={shape} data-collection-detail={item.id}
    data-detail={item.id === 'hat-comet' ? 'comet' : item.id === 'backpack-orbit' ? 'orbit' : undefined}>
    {wing ? <><g data-wing="left">{art}</g><g data-wing="right" transform="translate(64 0) scale(-1 1)">{art}</g></> : art}
  </g>;
}
