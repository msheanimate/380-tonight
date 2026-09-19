/** Placeholder art for venues without a photo: a deterministic gradient per slug plus a type icon.
 *  Add a `photo` field (path under /public) to any venue record and the photo replaces this. */

const PALETTES = [
  ['#1fb865', '#0e7c47'], // spring green
  ['#2f6fed', '#1b3fa8'], // IC blue
  ['#ff8a3d', '#e2503c'], // sunset
  ['#8b5cf6', '#5b32c7'], // violet
  ['#14b8a6', '#0f766e'], // teal
  ['#f59e0b', '#d97706'], // amber
  ['#ec4899', '#be185d'], // pink
  ['#0ea5e9', '#0369a1'], // sky
];

export function gradientFor(slug: string) {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [a, b] = PALETTES[h % PALETTES.length];
  const angle = 120 + (h % 60);
  return `linear-gradient(${angle}deg, ${a} 0%, ${b} 100%)`;
}

/** Simple, license-free line icons (24x24, stroke-based). */
export const ICONS: Record<string, string> = {
  bar: '<path d="M8 21h8M12 15v6M5 3h14l-7 9z"/>',
  brewery: '<path d="M6 4h9a2 2 0 0 1 2 2v13H6zM17 9h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M9 8v8M12 8v8"/>',
  restaurant: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 5v3h3v10"/>',
  'music-venue': '<path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  theater: '<path d="M3 5h18v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zM8 9h.01M16 9h.01M8 13c1 1.5 2.5 2 4 2s3-.5 4-2"/>',
  cinema: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 10h4M17 10h4M3 14h4M17 14h4"/>',
  arena: '<path d="M3 9a9 4 0 0 1 18 0v6a9 4 0 0 1-18 0zM3 9a9 4 0 0 0 18 0"/>',
  other: '<path d="M12 3l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9L6.7 19.5l1.1-6L3.4 9.3l6-.8z"/>',
  // nav
  tonight: '<path d="M12 3a9 9 0 1 0 9 9c0-.5 0-1-.1-1.4A6 6 0 0 1 12.4 3.1C12.3 3 12.1 3 12 3z"/>',
  drink: '<path d="M8 21h8M12 15v6M5 3h14l-7 9z"/>',
  eat: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 5v3h3v10"/>',
  events: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  gameday: '<path d="M4 12c0-4 4-8 8-8s8 4 8 8-4 8-8 8-8-4-8-8zM4 12c2-1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 4 0"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
};

export function iconSvg(name: string, extra = '') {
  const body = ICONS[name] ?? ICONS.other;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;
}
