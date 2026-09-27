// The one identifier for a show, used both at build time (Astro frontmatter)
// and in the browser: venue slug, ISO date, and the artist name lower-cased
// with punctuation stripped -- so a venue's own listing, the calendar's
// API-fed headline and a search result all agree on which show they mean.
export function showKey(slug: string, date: string, artist: string): string {
  const a = artist.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, '-').slice(0, 80);
  return `${slug}|${date}|${a}`;
}
