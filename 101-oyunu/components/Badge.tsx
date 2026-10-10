'use client';

import { useId } from 'react';

// Adın yanındaki rozet (profiles.badge): onay işaretli mühür.
// Şimdilik tek rozet: kurucu üye (altın). İleride premium üyelik eklenirse aynı mühür başka renkte.

type BadgeProps = {
  badge: string | null | undefined;
  className?: string;
};

export const BADGE_LABELS: Record<string, string> = {
  founder: 'Kurucu üye',
};

const BADGE_COLORS: Record<string, [string, string]> = {
  founder: ['#F7D774', '#C9921A'], // altın: açık → koyu
};

// Tırtıklı kenarlı mühür: Lucide ikon kütüphanesindeki "badge-check" ikonunun dış çizgisi.
// Lucide — ISC License. Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022
// as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.
// Permission to use, copy, modify, and/or distribute this software for any purpose with or without
// fee is hereby granted, provided that the above copyright notice and this permission notice appear
// in all copies. https://lucide.dev/license
const SEAL = 'M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z';

export function Badge({ badge, className = 'w-4 h-4' }: BadgeProps) {
  const gradientId = useId();
  if (!badge || !BADGE_COLORS[badge]) return null;
  const [light, dark] = BADGE_COLORS[badge];
  return (
    <svg
      className={`inline-block align-[-3px] flex-shrink-0 ${className}`}
      viewBox="0 0 24 24"
      role="img"
      aria-label={BADGE_LABELS[badge]}
    >
      <title>{BADGE_LABELS[badge]}</title>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={light} />
          <stop offset="100%" stopColor={dark} />
        </linearGradient>
      </defs>
      <path d={SEAL} fill={`url(#${gradientId})`} />
      <path d="m8.5 12 2.5 2.5 4.5-5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
