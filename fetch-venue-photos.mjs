#!/usr/bin/env node
/**
 * fetch-venue-photos.mjs
 * Run once from your Mac terminal: node fetch-venue-photos.mjs
 *
 * Searches Google Places for each venue, grabs the first 3 photo refs,
 * and writes src/data/venue-photos.json. Re-running skips venues that
 * already have refs so you can resume if it's interrupted.
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_KEY = 'AIzaSyAfgZvvM4cJxLg9vhi0xPkZSTn6OIWLi8M';
const OUT = join(__dirname, 'src/data/venue-photos.json');

async function searchPhotos(name, city) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.name,places.photos',
    },
    body: JSON.stringify({ textQuery: `${name} ${city}`, pageSize: 1 }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const photos = data.places?.[0]?.photos ?? [];
  return photos.slice(0, 3).map((p) => p.name); // e.g. "places/ChIJ.../photos/AeJbb8..."
}

const icVenues = JSON.parse(readFileSync(join(__dirname, 'src/data/venues-iowa-city.json'), 'utf8'));
const crVenues = JSON.parse(readFileSync(join(__dirname, 'src/data/venues-cedar-rapids.json'), 'utf8'));
const all = [...icVenues, ...crVenues];

let result = {};
try { result = JSON.parse(readFileSync(OUT, 'utf8')); } catch {}

let skipped = 0, fetched = 0, errored = 0;

for (const v of all) {
  if (result[v.slug]?.length > 0) { skipped++; continue; }
  try {
    const refs = await searchPhotos(v.name, v.city);
    result[v.slug] = refs;
    console.log(`✓  ${v.name} — ${refs.length} photo(s)`);
    fetched++;
  } catch (e) {
    console.error(`✗  ${v.name}: ${e.message}`);
    result[v.slug] = [];
    errored++;
  }
  await new Promise((r) => setTimeout(r, 200)); // stay under rate limits
}

writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(`\nDone. ${fetched} fetched, ${skipped} skipped, ${errored} errors.`);
console.log(`Wrote: src/data/venue-photos.json`);
