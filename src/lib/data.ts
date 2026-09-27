import ic from '../data/venues-iowa-city.json';
import cr from '../data/venues-cedar-rapids.json';
import districtsRaw from '../data/districts.json';
import eventsRaw from '../data/events.json';
import gamesRaw from '../data/games.json';

export type HappyHourWindow = {
  days: number[];        // 0 = Sun … 6 = Sat
  start: string;         // "15:00" (24h, Central)
  end: string;           // "18:00" or "close"
  deal?: string;
  source?: string;
  verify?: boolean;      // true = from a third-party listing, not the bar itself
};

export type Venue = {
  name: string; slug: string; city: string; district: string; type: string;
  address: string; tags: string[]; happy_hour: string | null; hours_note: string | null;
  /** Structured happy-hour windows (drives the "right now" strip on Tonight);
   *  `happy_hour` above is the human-readable summary of these. */
  happy_hours?: HappyHourWindow[];
  website: string; blurb: string; source: string; verify: boolean; menu_url?: string | null;
  doordash_url?: string | null;
};
export type District = {
  slug: string; name: string; city: string; side: 'ic' | 'cr'; scene: string; practical: string; events: string[];
};
export type Event = {
  title: string; date: string; end_date?: string; weekday?: string; time: string; venue_slug: string; city: string;
  location?: string;  // place name when the event isn't at a listed venue (e.g. the Ped Mall)
  image?: string;     // optional hero image URL; otherwise the venue's Google photo is used
  category: string; price: string; pick: boolean; blurb: string; source: string; verify: boolean;
};
export type Game = { date: string; opponent: string; home: boolean; time: string; tv?: string; seatgeek?: string };

export const venues: Venue[] = [...(ic as Venue[]), ...(cr as Venue[])];
export const districts: District[] = districtsRaw as District[];
export const events: Event[] = eventsRaw as Event[];
export const games: Game[] = (gamesRaw as { games: Game[] }).games;
export const gamesMeta = gamesRaw as { season: number; source: string; note: string };

const IC_CITIES = new Set(['Iowa City', 'Coralville', 'North Liberty', 'Solon']);
export const sideOf = (city: string): 'ic' | 'cr' => (IC_CITIES.has(city) ? 'ic' : 'cr');
export const sideLabel = (side: 'ic' | 'cr') => (side === 'ic' ? 'Iowa City side' : 'Cedar Rapids side');

export const venueBySlug = (slug: string) => venues.find((v) => v.slug === slug);
export const districtBySlug = (slug: string) => districts.find((d) => d.slug === slug);
export const venuesInDistrict = (slug: string) => venues.filter((v) => v.district === slug);

export const TYPE_LABEL: Record<string, string> = {
  bar: 'Bar', brewery: 'Brewery', restaurant: 'Restaurant', 'music-venue': 'Music venue',
  theater: 'Theater', cinema: 'Cinema', arena: 'Arena', other: 'Spot',
};

export function fmtDate(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Dated events on/after today plus weekly recurring ones, sorted with recurring last. */
export function upcomingEvents(today = new Date()) {
  const t = today.toISOString().slice(0, 10);
  const dated = events
    .filter((e) => e.date !== 'weekly' && (e.end_date ?? e.date) >= t)
    .sort((a, b) => a.date.localeCompare(b.date));
  const weekly = events.filter((e) => e.date === 'weekly');
  return { dated, weekly };
}
