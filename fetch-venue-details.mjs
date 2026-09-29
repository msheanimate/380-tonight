/**
 * fetch-venue-details.mjs
 * Refreshes phone numbers and weekly hours for every venue from Google Places
 * into src/data/venue-details.json (used by the go-to cards on profiles).
 * Uses the place IDs already saved in venue-photos.json, so no guessing.
 * Run from the project root: node fetch-venue-details.mjs
 */
import fs from 'fs';

const KEY = 'AIzaSyAfgZvvM4cJxLg9vhi0xPkZSTn6OIWLi8M';
const photos = JSON.parse(fs.readFileSync('src/data/venue-photos.json', 'utf8'));
const outPath = 'src/data/venue-details.json';
const pad = (n) => String(n).padStart(2, '0');
const out = {
  _about: "Phone numbers and weekly hours from Google Places, keyed by venue slug. hours[0]=Sunday ... hours[6]=Saturday; each day is 'HHMM-HHMM' ranges joined by commas, '' = closed. Refresh with: node fetch-venue-details.mjs",
  _fetched: new Date().toISOString().slice(0, 10),
};

for (const slug of Object.keys(photos).sort()) {
  const id = /places\/([^/]+)\/photos/.exec(photos[slug]?.[0] || '')?.[1];
  if (!id) continue;
  try {
    const d = await fetch(`https://places.googleapis.com/v1/places/${id}`, {
      headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'nationalPhoneNumber,regularOpeningHours.periods' },
    }).then((r) => r.json());
    const rec = {};
    const digits = (d.nationalPhoneNumber || '').replace(/\D/g, '').slice(0, 10);
    if (digits.length === 10) rec.phone = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    if (d.regularOpeningHours) {
      const days = [[], [], [], [], [], [], []];
      for (const p of d.regularOpeningHours.periods || []) {
        if (!p.close) { days[p.open.day].push('0000-2400'); continue; }
        days[p.open.day].push(`${pad(p.open.hour)}${pad(p.open.minute || 0)}-${pad(p.close.hour)}${pad(p.close.minute || 0)}`);
      }
      rec.hours = days.map((x) => x.join(','));
    }
    out[slug] = rec;
    process.stdout.write('.');
  } catch (e) {
    console.log(`\n${slug}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 80));
}
fs.writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n');
console.log(`\nSaved ${Object.keys(out).length - 2} venues to ${outPath}`);
