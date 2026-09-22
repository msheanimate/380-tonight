#!/usr/bin/env node
/**
 * fetch-shows.mjs — pull tonight's shows from Songkick + Tixr (Gabe's)
 *
 * Automated: a Claude scheduled task runs this every morning at ~9am CDT.
 * Manual:    node fetch-shows.mjs
 */
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── today in Central Time ─────────────────────────────────────────────────
const today = new Date();
const todayISO = today.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const todayLabel = today.toLocaleDateString('en-US', {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
});

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15';

// ─── Songkick venues ────────────────────────────────────────────────────────
const SONGKICK_VENUES = [
  { slug: 'wildwood-smokehouse-saloon', id: '504196',   name: 'Wildwood Smokehouse & Saloon' },
  { slug: 'englert-theatre',            id: '63107',    name: 'Englert Theatre' },
  { slug: 'hancher-auditorium',         id: '1133',     name: 'Hancher Auditorium' },
  { slug: 'xtream-arena',               id: '4404224',  name: 'Xtream Arena' },
  { slug: 'csps-hall',                  id: '50696',    name: 'CSPS / Legion Arts' },
  { slug: 'paramount-theatre',          id: '1388',     name: 'Paramount Theatre' },
  { slug: 'alliant-energy-powerhouse',  id: '4396986',  name: 'Alliant Energy PowerHouse' },
  { slug: 'mcgrath-amphitheatre',       id: '2565549',  name: 'McGrath Amphitheatre' },
  // Gabe's is also on Songkick but often misses shows — Tixr is the primary source
  { slug: 'gabes',                      id: '38637',    name: "Gabe's (Songkick)" },
];

// ─── Tixr venues (primary ticketing source — always check these) ─────────────
const TIXR_VENUES = [
  { slug: 'gabes', group: 'gabes', name: "Gabe's" },
];

// ─── fetch Songkick ──────────────────────────────────────────────────────────
async function fetchSongkickShows(venue) {
  const url = `https://www.songkick.com/venues/${venue.id}/calendar`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
    redirect: 'follow',
  });
  if (!res.ok) {
    if (res.status === 403) process.stdout.write('(blocked by Songkick) ');
    else process.stdout.write(`(HTTP ${res.status}) `);
    return [];
  }
  const html = await res.text();
  const shows = [];

  // Try JSON-LD first
  for (const [, raw] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data; try { data = JSON.parse(raw); } catch { continue; }
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      if (!['MusicEvent', 'Event'].includes(item['@type'])) continue;
      const date = (item.startDate || '').slice(0, 10);
      if (date !== todayISO) continue;
      const timeRaw = item.startDate?.length > 10
        ? new Date(item.startDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })
        : '';
      shows.push({ title: item.name || 'Show', time: timeRaw, ticket_url: item.offers?.url || item.url });
    }
  }
  if (shows.length) return shows;

  // Fallback: plain text scan
  const [yy, mm, dd] = todayISO.split('-');
  const monthName = ['January','February','March','April','May','June','July','August','September','October','November','December'][parseInt(mm)-1];
  const humanDate = `${parseInt(dd)} ${monthName} ${yy}`;
  if (html.includes(todayISO) || html.includes(humanDate)) {
    const idx = html.indexOf(humanDate);
    const win = html.slice(Math.max(0, idx - 100), idx + 800);
    const m = win.match(/class="[^"]*(?:summary|event-name)[^"]*"[^>]*>([^<]{3,80})</);
    if (m) shows.push({ title: m[1].trim(), time: '', ticket_url: undefined });
  }
  return shows;
}

// ─── fetch Tixr ──────────────────────────────────────────────────────────────
async function fetchTixrShows(venue) {
  // Step 1: get the group page and extract event slugs
  const groupUrl = `https://www.tixr.com/groups/${venue.group}`;
  let groupHtml;
  try {
    const res = await fetch(groupUrl, { headers: { 'User-Agent': UA } });
    if (!res.ok) { process.stdout.write(`(Tixr group HTTP ${res.status}) `); return []; }
    groupHtml = await res.text();
  } catch (e) {
    process.stdout.write(`(Tixr group error: ${e.message}) `);
    return [];
  }

  // Extract unique event paths like /groups/gabes/events/some-slug-12345
  const pathSet = new Set();
  for (const [, p] of groupHtml.matchAll(/["'](\/groups\/[^"'?#\s]+\/events\/[^"'?#\s]+)["']/g)) {
    pathSet.add(p);
  }
  const eventPaths = [...pathSet].slice(0, 40); // max 40 events
  if (!eventPaths.length) { process.stdout.write('(no Tixr event links found) '); return []; }

  // Step 2: check each event page for today's date
  const shows = [];
  for (const epath of eventPaths) {
    let html;
    try {
      const res = await fetch(`https://www.tixr.com${epath}`, { headers: { 'User-Agent': UA } });
      if (!res.ok) continue;
      html = await res.text();
    } catch { continue; }

    // Look for event:start_time meta tag
    const dtMatch = html.match(/property=["']event:start_time["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/content=["']([^"']+)["'][^>]*property=["']event:start_time["']/i);
    if (!dtMatch) continue;

    let startDate;
    try { startDate = new Date(dtMatch[1]); } catch { continue; }
    const eventDate = startDate.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    if (eventDate !== todayISO) continue;

    // Extract title from og:title or <title>
    const titleMatch = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i)
      || html.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch
      ? titleMatch[1].replace(/\s*[|\-–]\s*(Tixr|Tickets).*$/i, '').trim()
      : 'Show';

    const timeStr = startDate.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago'
    });

    shows.push({ title, time: timeStr, ticket_url: `https://www.tixr.com${epath}` });
    await new Promise(r => setTimeout(r, 200));
  }
  return shows;
}

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nThe 380 — show fetcher`);
  console.log(`Checking ${todayLabel}…\n`);

  const shows = [];
  const seenSlugs = new Set(); // prevent dupes if both Songkick+Tixr find same venue

  // ── Songkick venues ────────────────────────────────────────────────────────
  for (const venue of SONGKICK_VENUES) {
    process.stdout.write(`  ${venue.name.padEnd(38)} `);
    try {
      const found = await fetchSongkickShows(venue);
      if (found.length) {
        found.forEach(s => {
          if (!seenSlugs.has(venue.slug)) {
            shows.push({ venue_slug: venue.slug, ...s });
          }
        });
        seenSlugs.add(venue.slug);
        console.log(`✓  ${found.map(s => s.title).join(' / ')}`);
      } else {
        console.log('—  (nothing tonight)');
      }
    } catch (e) {
      console.log(`✗  ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 350));
  }

  // ── Tixr venues (catches shows Songkick misses) ────────────────────────────
  console.log('\n  — Tixr check —');
  for (const venue of TIXR_VENUES) {
    process.stdout.write(`  ${venue.name.padEnd(38)} `);
    try {
      const found = await fetchTixrShows(venue);
      if (found.length) {
        found.forEach(s => {
          // Merge: if Songkick already found a show at this venue, Tixr wins (better ticket URL)
          shows.forEach((existing, i) => {
            if (existing.venue_slug === venue.slug) shows.splice(i, 1);
          });
          shows.push({ venue_slug: venue.slug, ...s });
        });
        console.log(`✓  ${found.map(s => s.title).join(' / ')}`);
      } else if (seenSlugs.has(venue.slug)) {
        console.log('—  (Songkick already found a show)');
      } else {
        console.log('—  (nothing tonight)');
      }
    } catch (e) {
      console.log(`✗  ${e.message}`);
    }
  }

  const output = { date: todayISO, shows };
  const dest = path.join(__dirname, 'public', 'shows-tonight.json');
  writeFileSync(dest, JSON.stringify(output, null, 2));

  // Also write to dist/ so a running static server picks it up immediately
  try {
    const distDest = path.join(__dirname, 'dist', 'shows-tonight.json');
    writeFileSync(distDest, JSON.stringify(output, null, 2));
  } catch (_) {}

  console.log(`\n✓  Wrote ${shows.length} show(s) to public/shows-tonight.json`);
  if (!shows.length) {
    console.log('   No shows found tonight.');
  } else {
    shows.forEach(s => console.log(`   • ${s.venue_slug}: ${s.title} @ ${s.time}`));
  }
}

main().catch(console.error);
