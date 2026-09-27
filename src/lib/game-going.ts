// "I'm going" for games -- Hawkeye football and Corridor high school games and
// meets -- riding on the same show_rsvps table as concerts. A game gets a
// pseudo "venue" so the profile page knows how to label and link it:
//   hawkeyes-football  -> Hawkeye away games (home games use kinnick-stadium)
//   hs-<sport>         -> a high school game or meet (links to /high-school/)
import { showKey } from './show-key';

export const HS_SPORT_NAMES: Record<string, string> = {
  football: 'football', volleyball: 'volleyball', gbb: 'girls basketball', bbb: 'boys basketball',
  gsoc: 'girls soccer', bsoc: 'boys soccer', softball: 'softball', baseball: 'baseball',
  gtrack: 'girls track', btrack: 'boys track',
};

export type GoingRef = { key: string; slug: string; date: string; artist: string };

export function hawkeyeGoing(g: { date: string; opponent: string; home: boolean }): GoingRef {
  const opp = g.opponent.replace(/^at\s+/i, '');
  return {
    key: showKey('hawkeyes-football', g.date, opp),
    slug: g.home ? 'kinnick-stadium' : 'hawkeyes-football',
    date: g.date,
    artist: g.home ? `Hawkeyes vs ${opp}` : `Hawkeyes at ${opp}`,
  };
}

export function hsGoing(sport: string, id: string, date: string, title: string): GoingRef {
  return { key: `hs-${sport}|${date}|${id.slice(-24)}`, slug: `hs-${sport}`, date, artist: title.slice(0, 120) };
}

/** Where a going row points and what it says, for the non-venue slugs. */
export function pseudoPlace(slug: string): { href: string; label: string } | null {
  if (slug === 'hawkeyes-football') return { href: '/game-day/', label: 'Hawkeye football · away' };
  const m = /^hs-(.+)$/.exec(slug);
  if (m) return { href: '/high-school/#schedule', label: `High school ${HS_SPORT_NAMES[m[1]] ?? m[1]}` };
  return null;
}

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
export function goingButtonHtml(r: GoingRef, extraClass = '') {
  return `<button type="button" class="going-btn ${extraClass}" data-show-key="${esc(r.key)}" data-slug="${esc(r.slug)}" data-date="${esc(r.date)}" data-artist="${esc(r.artist)}" aria-pressed="false"><span class="going-icon" aria-hidden="true">✓</span><span class="going-label">I'm going</span><span class="going-count" hidden></span></button>`;
}
