// src/lib/goto-index.ts  (build time only)
//
// Everything a "go-to" card on a profile needs for every venue: logo, address,
// phone and weekly hours. Phone and hours come from src/data/venue-details.json
// (Google Places, refreshed with `node fetch-venue-details.mjs`); a phone number
// typed into the venue's own record wins over Google's.

import venuesIC from '../data/venues-iowa-city.json';
import venuesCR from '../data/venues-cedar-rapids.json';
import detailsRaw from '../data/venue-details.json';
import { TYPE_LABEL } from './data';
import { logoFor, monogram } from './art';
import type { GotoVenue } from './goto-card';

type Detail = { phone?: string; hours?: string[] };
const details = detailsRaw as unknown as Record<string, Detail>;

// Google's hours for stadiums, theaters and museums are box-office or office
// hours, which would read as "closed" on a show night -- leave those off.
const HOURS_TYPES = new Set(['bar', 'brewery', 'restaurant', 'cafe', 'music-venue']);

export function gotoIndex(): GotoVenue[] {
  return [...venuesIC, ...venuesCR].map((v: any) => {
    const d = details[v.slug] ?? {};
    return {
      slug: v.slug,
      name: v.name,
      city: v.city,
      kind: TYPE_LABEL[v.type] ?? (v.type === 'cafe' ? 'Café' : 'Spot'),
      address: (v.address || '').replace(/, IA \d{5}.*$/, '').replace(/, (Iowa City|Cedar Rapids|Coralville|North Liberty|Marion|Solon)$/, ''),
      maps: v.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${v.name}, ${v.address}`)}` : '',
      phone: v.phone || d.phone || '',
      hours: HOURS_TYPES.has(v.type) && d.hours ? d.hours : null,
      logo: logoFor(v.website),
      mono: monogram(v.name),
    };
  });
}
