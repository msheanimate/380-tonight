/**
 * fix-opus-photos.mjs
 * Targeted fix for Opus Concert Cafe — tries multiple search queries.
 * Run: node fix-opus-photos.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY = 'AIzaSyAfgZvvM4cJxLg9vhi0xPkZSTn6OIWLi8M';

const photosPath = path.join(__dirname, 'src/data/venue-photos.json');
const existing = JSON.parse(fs.readFileSync(photosPath, 'utf8'));

const queries = [
  'Opus Concert Cafe Cedar Rapids Iowa',
  'Opus Cedar Rapids Iowa music',
  'Orchestra Iowa Cedar Rapids',
  'Paramount Theatre Cedar Rapids Iowa',
  '119 3rd Ave SE Cedar Rapids Iowa concert',
];

async function searchPlace(textQuery) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.photos',
    },
    body: JSON.stringify({ textQuery }),
  });
  const data = await res.json();
  if (!data.places?.length) return null;
  const place = data.places[0];
  console.log(`  → Found: "${place.displayName?.text}" (${place.photos?.length ?? 0} photos)`);
  return { id: place.id, photos: place.photos ?? [] };
}

for (const q of queries) {
  console.log(`\nSearching: "${q}"`);
  const result = await searchPlace(q);
  if (result?.photos?.length) {
    const photoNames = result.photos.slice(0, 5).map(p => p.name);
    existing['opus-concert-cafe'] = photoNames;
    fs.writeFileSync(photosPath, JSON.stringify(existing, null, 2));
    console.log(`\n✓ Saved ${photoNames.length} photos for opus-concert-cafe`);
    process.exit(0);
  }
}

console.log('\n✗ No photos found with any query. You may need to add them manually.');
