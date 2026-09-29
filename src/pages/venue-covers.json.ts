// /venue-covers.json -- each venue's first photo, by slug. Built with the site.
// The home page's happy-hour strip fetches this only when an owner adds a bar
// that wasn't in the strip at build time, so that card still gets its photo.
import type { APIRoute } from 'astro';
import venuePhotosRaw from '../data/venue-photos.json';

const PLACES_KEY = 'AIzaSyAfgZvvM4cJxLg9vhi0xPkZSTn6OIWLi8M';

export const GET: APIRoute = () => {
  const out: Record<string, string> = {};
  for (const [slug, refs] of Object.entries(venuePhotosRaw as Record<string, string[]>)) {
    if (refs?.length) out[slug] = `https://places.googleapis.com/v1/${refs[0]}/media?maxWidthPx=800&key=${PLACES_KEY}`;
  }
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
};
