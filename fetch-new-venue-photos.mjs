/**
 * fetch-new-venue-photos.mjs
 * Only fetches photos for venues that don't have them yet in venue-photos.json.
 * Appends to the existing file rather than replacing it.
 * Run from the project root: node fetch-new-venue-photos.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY = 'AIzaSyAfgZvvM4cJxLg9vhi0xPkZSTn6OIWLi8M';
const PHOTO_COUNT = 5;
const delay = ms => new Promise(r => setTimeout(r, ms));

const icVenues = JSON.parse(fs.readFileSync(path.join(__dirname, 'src/data/venues-iowa-city.json'), 'utf8'));
const crVenues = JSON.parse(fs.readFileSync(path.join(__dirname, 'src/data/venues-cedar-rapids.json'), 'utf8'));
const allVenues = [...icVenues, ...crVenues];

const photosPath = path.join(__dirname, 'src/data/venue-photos.json');
const existing = JSON.parse(fs.readFileSync(photosPath, 'utf8'));

// Only process venues with no photos yet
const missing = allVenues.filter(v => !existing[v.slug]);
console.log(`${missing.length} venues need photos (${Object.keys(existing).length} already have them)\n`);

if (!missing.length) { console.log('Nothing to do!'); process.exit(0); }

async function searchPlace(name, city) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': KEY,
      'X-Goog-FieldMask': 'places.id,places.photos',
    },
    body: JSON.stringify({ textQuery: `${name} ${city} Iowa` }),
  });
  const data = await res.json();
  if (!data.places?.length) return { id: null, photos: [] };
  const place = data.places[0];
  return { id: place.id, photos: place.photos ?? [] };
}

const results = { ...existing };

for (const v of missing) {
  try {
    process.stdout.write(`${v.name}... `);
    const { id, photos } = await searchPlace(v.name, v.city);
    if (!id) { console.log('not found'); await delay(100); continue; }
    if (!photos.length) { console.log('no photos'); await delay(100); continue; }
    const photoNames = photos.slice(0, PHOTO_COUNT).map(p => p.name);
    results[v.slug] = photoNames;
    console.log(`✓ ${photoNames.length} photos`);
    await delay(100);
  } catch (e) {
    console.log(`error: ${e.message}`);
  }
}

fs.writeFileSync(photosPath, JSON.stringify(results, null, 2));
console.log(`\nDone — venue-photos.json updated.`);
