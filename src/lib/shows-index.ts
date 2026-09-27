// Shared "every upcoming show in the area" index, used by the header search
// box (Base.astro) and the full /search/ page so a band name finds the gig
// everywhere, not just on one page.
import venuesIC from '../data/venues-iowa-city.json';
import venuesCR from '../data/venues-cedar-rapids.json';
import eventsRaw from '../data/events.json';

export type ShowHit = {
  artist: string; date: string; weekday: string | null; time: string | null; url: string | null;
  slug: string; venue: string; city: string; kind: string;
};

// Generic words a person might type instead of a band name ("concert",
// "live music", "game"), derived from the venue type and event category.
const KIND_BY_TYPE: Record<string, string> = {
  'music-venue': 'concert concerts show shows live music band bands gig gigs',
  theater: 'concert concerts show shows theater theatre performance live music',
  arena: 'concert concerts show shows game games live music sports',
};
const KIND_BY_CATEGORY: Record<string, string> = {
  music: 'concert concerts show shows live music band bands',
  'game-day': 'game games watch party football hawkeyes sports game day',
  nightlife: 'nightlife night out',
  arts: 'arts art show',
  festival: 'festival festivals fest',
};

export const allVenues = [...venuesIC, ...venuesCR];
// Central-Time "today", same convention as events.astro and the venue pages.
export const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

const kindFor = (v: any, extra = '') =>
  `${KIND_BY_TYPE[v.type] ?? 'event events'} ${(v.tags ?? []).join(' ').replace(/-/g, ' ')} ${extra}`.toLowerCase();

export function buildShowIndex(): ShowHit[] {
  const venueBySlug = new Map(allVenues.map((v) => [v.slug, v]));
  const shows: ShowHit[] = [];
  for (const v of allVenues) {
    for (const sh of ((v as any).shows ?? []) as any[]) {
      if (typeof sh.date !== 'string' || sh.date < todayStr) continue;
      shows.push({ artist: sh.artist, date: sh.date, weekday: null, time: sh.time ?? null, url: sh.url ?? null, slug: v.slug, venue: v.name, city: v.city, kind: kindFor(v) });
    }
  }
  for (const e of eventsRaw as any[]) {
    // Events at a place that isn't a listed venue (the Ped Mall, a park)
    // still get a row; they carry an empty slug and link to /events/ instead.
    const ven = venueBySlug.get(e.venue_slug);
    const slug = ven?.slug ?? '';
    const venueName = ven?.name ?? e.location ?? e.city;
    const city = ven?.city ?? e.city;
    const kind = kindFor(ven ?? { type: 'event', tags: [] }, `${e.category} ${KIND_BY_CATEGORY[e.category] ?? ''}`);
    if (e.date === 'weekly') {
      shows.push({ artist: e.title, date: 'weekly', weekday: e.weekday ?? null, time: e.time ?? null, url: null, slug, venue: venueName, city, kind: `${kind} weekly` });
    } else if ((e.end_date ?? e.date) >= todayStr) {
      shows.push({ artist: e.title, date: e.date, weekday: null, time: e.time ?? null, url: e.source ?? null, slug, venue: venueName, city, kind });
    }
  }
  // Soonest first; weekly recurring rows sort after every dated one.
  shows.sort((a, b) =>
    Number(a.date === 'weekly') - Number(b.date === 'weekly') ||
    a.date.localeCompare(b.date) ||
    (a.time ?? '').localeCompare(b.time ?? ''));
  return shows;
}
