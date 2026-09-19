import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY = 'AIzaSyAfgZvvM4cJxLg9vhi0xPkZSTn6OIWLi8M';
const PHOTO_COUNT = 5;
const delay = ms => new Promise(r => setTimeout(r, ms));

const icVenues = JSON.parse(fs.readFileSync(path.join(__dirname, 'src/data/venues-iowa-city.json'), 'utf8'));
const crVenues = JSON.parse(fs.readFileSync(path.join(__dirname, 'src/data/venues-cedar-rapids.json'), 'utf8'));
const venues = [...icVenues, ...crVenues];

// Uses the new Places API (v1)
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

const results = {};

for (const v of venues) {
  try {
    process.stdout.write(`${v.name}... `);
    const { id, photos } = await searchPlace(v.name, v.city);
    if (!id) { console.log('not found'); await delay(100); continue; }
    if (!photos.length) { console.log('no photos'); await delay(100); continue; }

    // Photo URL format for the new API
    const photoNames = photos.slice(0, PHOTO_COUNT).map(p => p.name);
    results[v.slug] = photoNames;
    console.log(`✓ ${photoNames.length} photos`);
    await delay(100);
  } catch (e) {
    console.log(`error: ${e.message}`);
  }
}

const outPath = path.join(__dirname, 'src/data/venue-photos.json');
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`\nDone — ${Object.keys(results).length}/${venues.length} venues with photos.`);
