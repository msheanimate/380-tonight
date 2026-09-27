// src/lib/scores.ts
//
// Corridor high school scores, schedules and standings, read from Bound
// (gobound.com) -- the platform the IHSAA and IGHSAU use for official
// schedules, results and standings. Every team page is server-rendered HTML:
//   /ia/{assoc}/{sport}/{season}/{school}/v/schedule        team schedule + results
//   /ia/conferences/{conf}/sports/{code}/{season}/standings conference standings
//   /ia/ihsaa/football/{season}/standings?idGroup=...       football district standings
// Same refresh model as news.ts / rankings.ts: per request in dev (cached),
// at build time in production. Each game gets the state rank of both teams
// from rankings.ts where the poll is parseable.

import { getRankings, FINAL_OFFSEASON, type Poll } from './rankings';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const BOUND = 'https://www.gobound.com';
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; The380 scoreboard reader)' };
const CACHE_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; val: any }>();
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.val;
  try { const val = await fn(); cache.set(key, { at: Date.now(), val }); return val; }
  catch { return hit?.val ?? null; }
}
// Bound sits behind a bot wall that answers bursts with an empty 202
// challenge. So: every page is also kept on disk (node_modules/.cache, not in
// git) and reused while fresh -- that survives dev-server reloads and restarts
// -- requests are spaced out, we back off after a challenge, and on any
// failure the last copy on disk is used instead.
const DISK = join(process.cwd(), 'node_modules', '.cache', 'the380-bound');
const diskFile = (url: string) => join(DISK, createHash('sha1').update(url).digest('hex') + '.html');
function diskRead(url: string): { at: number; body: string } | null {
  try { const f = diskFile(url); return { at: statSync(f).mtimeMs, body: readFileSync(f, 'utf8') }; } catch { return null; }
}
function diskWrite(url: string, body: string) {
  try { mkdirSync(DISK, { recursive: true }); writeFileSync(diskFile(url), body); } catch { /* read-only build box: memory cache still works */ }
}
const MISSING = '__404__';
let blockedUntil = 0;
let lastAt = 0;
async function getText(url: string, ttl = CACHE_MS): Promise<string> {
  const hit = diskRead(url);
  const fresh = hit && Date.now() - hit.at < ttl;
  if (fresh && hit!.body === MISSING) throw new Error(`404 ${url}`);
  if (fresh) return hit!.body;
  try {
    if (Date.now() < blockedUntil) throw new Error('backing off');
    const wait = lastAt + 300 - Date.now();
    lastAt = Math.max(Date.now(), lastAt + 300);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(12000) });
    const body = r.ok ? await r.text() : '';
    if (r.status === 202 || (r.ok && body.length < 500)) { blockedUntil = Date.now() + 3 * 60 * 1000; throw new Error(`challenged ${url}`); }
    if (r.status === 404) { diskWrite(url, MISSING); throw new Error(`404 ${url}`); }
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    diskWrite(url, body);
    return body;
  } catch (e: any) {
    if (hit && hit.body !== MISSING && !/^404/.test(String(e?.message))) return hit.body;   // stale beats nothing
    throw e;
  }
}
/** Run `fn` over `items`, at most `n` at a time (be polite to Bound). */
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ', hellip: '…', rsquo: '’', lsquo: '‘' };
const decode = (s: string) => s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&([a-z]+);/gi, (m, n) => ENT[n] ?? m);
const text = (html: string) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/[\s ]+/g, ' ').trim();
const cells = (tr: string) => (tr.match(/<td[\s\S]*?<\/td>/g) ?? []);

// ── What we cover ──────────────────────────────────────────────────────────
export type Area = 'Iowa City' | 'Cedar Rapids' | 'Area';
export type School = { slug: string; name: string; short: string; area: Area; conf: string };
export const SCHOOLS: School[] = [
  { slug: 'iccityhigh', name: 'Iowa City High', short: 'City High', area: 'Iowa City', conf: 'mvc' },
  { slug: 'icwest', name: 'Iowa City West', short: 'West', area: 'Iowa City', conf: 'mvc' },
  { slug: 'icliberty', name: 'Iowa City Liberty', short: 'Liberty', area: 'Iowa City', conf: 'mvc' },
  { slug: 'crkennedy', name: 'Cedar Rapids Kennedy', short: 'Kennedy', area: 'Cedar Rapids', conf: 'mvc' },
  { slug: 'crwashington', name: 'Cedar Rapids Washington', short: 'Washington', area: 'Cedar Rapids', conf: 'mvc' },
  { slug: 'crjefferson', name: 'Cedar Rapids Jefferson', short: 'Jefferson', area: 'Cedar Rapids', conf: 'mvc' },
  { slug: 'crprairie', name: 'Cedar Rapids Prairie', short: 'Prairie', area: 'Cedar Rapids', conf: 'mvc' },
  { slug: 'xavier', name: 'Cedar Rapids Xavier', short: 'Xavier', area: 'Cedar Rapids', conf: 'mvc' },
  { slug: 'linnmar', name: 'Linn-Mar', short: 'Linn-Mar', area: 'Cedar Rapids', conf: 'mvc' },
  { slug: 'marion', name: 'Marion', short: 'Marion', area: 'Cedar Rapids', conf: 'wamac' },
  { slug: 'cedarvalleychristian', name: 'Cedar Valley Christian', short: 'CVC', area: 'Cedar Rapids', conf: 'trc' },
  { slug: 'regina', name: 'Iowa City Regina', short: 'Regina', area: 'Iowa City', conf: 'rvc' },
  { slug: 'solon', name: 'Solon', short: 'Solon', area: 'Area', conf: 'wamac' },
  { slug: 'clearcreekamana', name: 'Clear Creek Amana', short: 'CCA', area: 'Area', conf: 'wamac' },
  { slug: 'mountvernon', name: 'Mount Vernon', short: 'Mount Vernon', area: 'Area', conf: 'wamac' },
  { slug: 'centerpointurbana', name: 'Center Point-Urbana', short: 'CPU', area: 'Area', conf: 'wamac' },
  { slug: 'williamsburg', name: 'Williamsburg', short: 'Williamsburg', area: 'Area', conf: 'wamac' },
  { slug: 'westbranch', name: 'West Branch', short: 'West Branch', area: 'Area', conf: 'rvc' },
  { slug: 'lisbon', name: 'Lisbon', short: 'Lisbon', area: 'Area', conf: 'rvc' },
  { slug: 'tipton', name: 'Tipton', short: 'Tipton', area: 'Area', conf: 'rvc' },
  { slug: 'midprairie', name: 'Mid-Prairie', short: 'Mid-Prairie', area: 'Area', conf: 'rvc' },
  { slug: 'alburnett', name: 'Alburnett', short: 'Alburnett', area: 'Area', conf: 'rvc' },
  { slug: 'northlinn', name: 'North Linn', short: 'North Linn', area: 'Area', conf: 'trc' },
  { slug: 'springville', name: 'Springville', short: 'Springville', area: 'Area', conf: 'trc' },
];
export const CONF_NAMES: Record<string, string> = { mvc: 'Mississippi Valley', wamac: 'WaMaC', rvc: 'River Valley', trc: 'Tri-Rivers' };

export type SportKey = 'football' | 'volleyball' | 'bbb' | 'gbb' | 'bsoc' | 'gsoc' | 'baseball' | 'softball' | 'btrack' | 'gtrack';
// kind 'meet': many-team meets with a place and team points instead of a score (track)
type SportDef = { key: SportKey; name: string; path: string; conf: string; season: [number, number]; rankKey?: string; districts?: boolean; sets?: boolean; kind?: 'meet' };
export const SCORE_SPORTS: SportDef[] = [
  { key: 'football', name: 'Football', path: 'ihsaa/football', conf: 'football', season: [8, 11], rankKey: 'football', districts: true },
  { key: 'volleyball', name: 'Volleyball', path: 'ighsau/vb', conf: 'vb', season: [8, 11], rankKey: 'volleyball', sets: true },
  { key: 'gbb', name: 'Girls basketball', path: 'ighsau/girlsbasketball', conf: 'girlsbasketball', season: [11, 3], rankKey: 'gbb' },
  { key: 'bbb', name: 'Boys basketball', path: 'ihsaa/boysbasketball', conf: 'boysbasketball', season: [11, 3], rankKey: 'bbb' },
  { key: 'gsoc', name: 'Girls soccer', path: 'ighsau/girlssoccer', conf: 'girlssoccer', season: [3, 6] },
  { key: 'bsoc', name: 'Boys soccer', path: 'ihsaa/boyssoccer', conf: 'boyssoccer', season: [3, 6] },
  { key: 'softball', name: 'Softball', path: 'ighsau/softball', conf: 'softball', season: [5, 7], rankKey: 'softball' },
  { key: 'baseball', name: 'Baseball', path: 'ihsaa/baseball', conf: 'baseball', season: [5, 7], rankKey: 'baseball' },
  { key: 'gtrack', name: 'Girls track', path: 'ighsau/girlstrack', conf: 'girlstrack', season: [3, 5], kind: 'meet' },
  { key: 'btrack', name: 'Boys track', path: 'ihsaa/boystrack', conf: 'boystrack', season: [3, 5], kind: 'meet' },
];
const inSeason = (s: { season: [number, number] }, m: number) => { const [a, b] = s.season; return a <= b ? m >= a && m <= b : m >= a || m <= b; };
/** Bound labels school years "2026-27"; summer sports belong to the year that started the previous August. */
export function seasonLabel(d = new Date()) { const y = d.getFullYear(); const s = d.getMonth() + 1 >= 8 ? y : y - 1; return `${s}-${String((s + 1) % 100).padStart(2, '0')}`; }

// ── State-rank lookup (poll names are written loosely, so normalise hard) ──
export type RankTag = { rank: number; cls: string };
export const normName = (s: string) => ' ' + s.toLowerCase().replace(/&amp;|&/g, ' ').replace(/[.'’,()-]/g, ' ')
  .replace(/\bcedar rapids\b/g, 'cr').replace(/\biowa city\b/g, 'ic').replace(/\bwest des moines\b/g, 'wdm').replace(/\bdes moines\b/g, 'dm')
  .replace(/\bcouncil bluffs\b/g, 'cb').replace(/\bsioux city\b/g, 'sc').replace(/\bmt\b/g, 'mount').replace(/\bst\b/g, 'saint')
  .replace(/\b(catholic|high school|community|high)\b/g, ' ').replace(/\s+/g, ' ').trim();
function rankMap(poll: Poll | null | undefined) {
  const m = new Map<string, RankTag>();
  for (const c of poll?.classes ?? []) for (const r of c.rows) m.set(normName(r.school), { rank: r.rank, cls: c.name.replace(/^Class\s+/i, '') });
  return m;
}
const CITY = /^(cr|ic|dm|wdm|cb|sc) /;
function findRank(m: Map<string, RankTag>, name: string): RankTag | null {
  if (!m.size || !name) return null;
  const n = normName(name);
  if (m.has(n)) return m.get(n)!;
  // "Dowling Catholic" vs "WDM Dowling", "Regina Catholic" vs "Iowa City Regina":
  // when exactly one side carries a city prefix, compare what's left.
  for (const [k, v] of m) {
    if (CITY.test(k) !== CITY.test(n) && k.replace(CITY, '') === n.replace(CITY, '')) return v;
  }
  return null;
}

// ── Team schedules ─────────────────────────────────────────────────────────
export type Side = { name: string; logo: string | null; school?: string; score: number | null; rank: RankTag | null };
export type Game = {
  id: string; date: string; time: string | null; kind: 'game' | 'event';
  home: Side; away: Side; final: boolean; winner: 'home' | 'away' | 'tie' | null;
  detail: string; conf: boolean; caption: string; location: string; url: string; tickets: string | null; schools: string[];
  // meets only: each Corridor school entered, with its finish ("2nd", 158 pts) once scored
  field?: { school: string; place: string | null; pts: string | null }[]; status?: 'cxl' | 'ppd';
};
type Team = { school: School; name: string; logo: string | null; url: string };

const isoDate = (mdy: string) => { const [m, d, y] = mdy.split('/').map(Number); return `${2000 + (y % 100)}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; };

async function teamSchedule(sport: SportDef, season: string, school: School, ttl = CACHE_MS): Promise<{ team: Team; rows: any[]; missing?: boolean } | null> {
  return cached(`sched:${sport.key}:${season}:${school.slug}`, async () => {
    const url = `${BOUND}/ia/${sport.path}/${season}/${school.slug}/v/schedule`;
    let html: string;
    try { html = await getText(url, ttl); }
    catch (e: any) {
      // no team in this sport at this school (e.g. small schools and soccer): remember that
      if (/^404/.test(String(e?.message))) return { team: { school, name: school.name, logo: null, url }, rows: [], missing: true };
      throw e;                          // anything else -> cached() keeps the last good copy
    }
    const logo = (/property="og:image" content="([^"]+)"/.exec(html) || [])[1] ?? null;
    const team: Team = { school, name: school.name, logo, url };
    const body = html.slice(html.indexOf('<tbody'), html.lastIndexOf('</tbody>'));
    const rows: any[] = [];
    for (const tr of body.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
      const td = cells(tr);
      if (td.length < 6 || !/^\s*<td>\d{1,2}\/\d{1,2}\/\d{2}/.test(td[0])) continue;
      const date = isoDate(text(td[0]));
      const opp = td[1];
      const mark = (/<span class="mr-1">\s*(vs|@)\s*<\/span>/.exec(opp) || [])[1] ?? null;
      const logos = [...opp.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1]);
      const eventName = text((/<p class="font-weight-bold[^"]*">([\s\S]*?)<\/p>/.exec(opp) || [, ''])[1]);
      const oppName = text((/<a href="\/direct\/teams\/[^"]+">([\s\S]*?)<\/a>/.exec(opp) || [, ''])[1]);
      const res = text(td[2]);
      const compHref = (/href="(\/ia\/[^"]*\/comps\/(h[0-9a-f]+)[^"]*)"/.exec(td[2]) || []);
      const tickets = (/href="(https:\/\/www\.gobound\.com\/events\/[^"]+\/tickets)"/.exec(tr) || [])[1] ?? null;
      rows.push({
        date, mark, oppName, oppLogo: mark ? logos[0] ?? null : null, eventName: mark ? '' : eventName,
        multi: logos.length > 1 && !mark, res, compId: compHref[2] ?? null,
        compUrl: compHref[1] ? BOUND + decode(compHref[1]).replace(/\?.*$/, '') : url,
        conf: /Conference Competition/.test(td[3] ?? ''), caption: text(td[4] ?? ''), location: text(td[5] ?? ''), tickets,
      });
    }
    return { team, rows };
  });
}

/** Set scores come from our school's side; cards list away first, so flip when we're home. */
function setLine(raw: string | undefined, weAreHome: boolean) {
  const sets = (raw ?? '').replace(/[()]/g, '').trim();
  if (!sets || !weAreHome) return sets;
  return sets.split(/,\s*/).map((p) => p.split('-').reverse().join('-')).join(', ');
}
const cleanCaption = (c: string) => c.replace(/^["“”']+|["“”']+$/g, '').replace(/^Court\s*\d+$/i, '').trim();

/** A track meet row from one school's schedule: "2nd - 158", "4th", "CXL Cancelled", "PPD ...", or a start time. */
function toMeet(t: Team, r: any): Game {
  const pm = /^(\d+(?:st|nd|rd|th))(?:\s*-\s*([\d.]+))?/i.exec(r.res);
  const cxl = /^CXL|cancel/i.test(r.res), ppd = /^PPD|postpon/i.test(r.res);
  const time = /^(\d{1,2}:\d{2}\s*[AP]M)/i.exec(r.res)?.[1]?.replace(/\s+/, ' ') ?? null;
  const name = r.eventName || (r.oppName ? `${t.school.short} vs ${r.oppName}` : r.caption || 'Meet');
  return {
    id: r.compId ?? `${r.date}:${normName(name)}`, date: r.date, time, kind: 'event',
    home: { name: t.name, logo: t.logo, school: t.school.slug, score: null, rank: null },
    away: { name, logo: null, score: null, rank: null },
    final: !!pm || /^FINAL/i.test(r.res), winner: null, detail: '', conf: r.conf,
    caption: cxl ? 'Cancelled' : ppd ? 'Postponed' : '', location: r.location, url: r.compUrl, tickets: r.tickets,
    schools: [t.school.slug], field: [{ school: t.school.slug, place: pm?.[1] ?? null, pts: pm?.[2] ?? null }],
    ...(cxl ? { status: 'cxl' as const } : ppd ? { status: 'ppd' as const } : {}),
  };
}

function toGame(t: Team, r: any, ranks: Map<string, RankTag>, bySchoolName: Map<string, School>): Game | null {
  const scrimmage = /scrimmage/i.test(r.caption);
  const wl = /^([WLT])\s+(\d+)-(\d+)\s*(\(.*\))?/.exec(r.res);
  const time = /^(\d{1,2}:\d{2}\s*[AP]M)/i.exec(r.res)?.[1]?.replace(/\s+/, ' ') ?? null;
  const us: Side = { name: t.name, logo: t.logo, school: t.school.slug, score: wl ? +wl[2] : null, rank: findRank(ranks, t.name) };
  const oppSchool = bySchoolName.get(normName(r.oppName));
  // Bound shortens some opponents ("Xavier", "Prairie"); show our schools by their full name
  const oppName = oppSchool ? oppSchool.name : r.oppName;
  const them: Side = { name: oppName || (r.mark ? 'TBD' : r.eventName || 'Event'), logo: r.oppLogo, school: oppSchool?.slug, score: wl ? +wl[3] : null, rank: oppName ? findRank(ranks, oppName) ?? findRank(ranks, r.oppName) : null };
  if (!r.mark && r.multi) {
    // tournament / invite container row: the matches are listed separately
    if (/FINAL/i.test(r.res)) return null;
  }
  const home = r.mark === '@' ? them : us;
  const away = r.mark === '@' ? us : them;
  let winner: Game['winner'] = null;
  if (wl) winner = wl[1] === 'T' ? 'tie' : (wl[1] === 'W') === (home === us) ? 'home' : 'away';
  return {
    id: r.compId ?? `${r.date}:${[t.school.slug, oppSchool?.slug ?? normName(r.oppName)].sort().join('|')}:${r.eventName}`,
    date: r.date, time, kind: r.mark ? 'game' : 'event', home, away,
    final: !!wl, winner, detail: setLine(wl?.[4], home === us),
    conf: r.conf, caption: scrimmage ? 'Scrimmage' : cleanCaption(r.eventName || r.caption), location: r.location,
    url: r.compUrl, tickets: r.tickets, schools: [t.school.slug, ...(oppSchool ? [oppSchool.slug] : [])],
  };
}

// ── Standings ──────────────────────────────────────────────────────────────
export type StandRow = { name: string; logo: string | null; school?: string; rank: RankTag | null; grp: [number, number]; all: [number, number]; grpT?: number; allT?: number; pf?: number; pa?: number };
export type StandTable = { title: string; sub: string; grpLabel: string; url: string; rows: StandRow[] };

type Group = { label: string; at: number; span: number };   // `at` = index into a row's number cells
function parseStandTables(html: string): { title: string; groups: Group[]; rows: { name: string; logo: string | null; nums: string[] }[] }[] {
  const out: any[] = [];
  const re = /(?:<h4>([\s\S]*?)<\/h4>[\s\S]*?)?<table[\s\S]*?<\/table>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tbl = m[0].slice(m[0].indexOf('<table'));
    // First header row: "#", "Name", then one cell per group (W-L-PCT, or W-L-T-PCT for soccer)
    const head = (/<thead[\s\S]*?<tr[\s\S]*?<\/tr>/.exec(tbl) || [''])[0];
    const groups: Group[] = [];
    let col = 0;
    for (const th of head.match(/<th[\s\S]*?<\/th>/g) ?? []) {
      const span = +((/colspan="(\d+)"/.exec(th) || [])[1] ?? 1);
      if (span > 1) groups.push({ label: text(th), at: col - 2, span });
      col += span;
    }
    const body = tbl.slice(tbl.indexOf('<tbody'));
    const rows = (body.match(/<tr[\s\S]*?<\/tr>/g) ?? []).map((tr) => {
      const td = cells(tr);
      return { name: text(td[1] ?? ''), logo: (/<img src="([^"]+)"/.exec(td[1] ?? '') || [])[1] ?? null, nums: td.slice(2).map(text) };
    }).filter((r) => r.name);
    out.push({ title: text(m[1] ?? ''), groups, rows });
  }
  return out;
}
function toRows(t: ReturnType<typeof parseStandTables>[number], grpName: RegExp, ranks: Map<string, RankTag>, bySchoolName: Map<string, School>): StandRow[] {
  const G = (re: RegExp) => t.groups.find((g) => re.test(g.label));
  const gg = G(grpName), og = G(/overall|season/i), pg = G(/points/i);
  const ties = (gg?.span ?? 3) >= 4;          // soccer tables carry a T column
  return t.rows.map((r) => {
    const at = (g: Group | undefined, k: number) => (g ? parseFloat(r.nums[g.at + k]) : NaN);
    const s = bySchoolName.get(normName(r.name));
    return {
      name: s ? s.name : r.name, logo: r.logo, school: s?.slug, rank: (s && findRank(ranks, s.name)) || findRank(ranks, r.name),
      grp: [at(gg, 0) || 0, at(gg, 1) || 0], all: [at(og, 0) || 0, at(og, 1) || 0],
      ...(ties ? { grpT: at(gg, 2) || 0, allT: at(og, 2) || 0 } : {}),
      ...(pg ? { pf: at(pg, 0), pa: at(pg, 1) } : {}),
    };
  }).sort((a, b) => {
    // ties count half, the usual soccer standings rule
    const pct = (w: number, l: number, t = 0) => (w + l + t ? (w + t / 2) / (w + l + t) : 0);
    return pct(b.grp[0], b.grp[1], b.grpT) - pct(a.grp[0], a.grp[1], a.grpT) || (b.grp[0] - a.grp[0]) || pct(b.all[0], b.all[1], b.allT) - pct(a.all[0], a.all[1], a.allT);
  });
}

async function footballDistricts(sport: SportDef, season: string, ranks: Map<string, RankTag>, bySchoolName: Map<string, School>): Promise<StandTable[]> {
  return (await cached(`districts:${season}`, async () => {
    const confs = [...new Set(SCHOOLS.map((s) => s.conf))];
    const names = new Set<string>();
    await pool(confs, 3, async (c) => {
      try {
        const html = await getText(`${BOUND}/ia/conferences/${c}/sports/football/${season}/standings`);
        for (const t of parseStandTables(html)) if (t.title && t.rows.some((r) => bySchoolName.has(normName(r.name)))) names.add(t.title);
      } catch { /* conference page missing */ }
    });
    const base = `${BOUND}/ia/${sport.path}/${season}/standings`;
    const idx = await getText(base);
    const ids = new Map<string, string>();
    for (const m of idx.matchAll(/<option value="(h[0-9a-f]+)"[^>]*>([^<]+)<\/option>/g)) ids.set(text(m[2]), m[1]);
    const order = [...names].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    const tables = await pool(order, 4, async (name) => {
      const id = ids.get(name); if (!id) return null;
      const url = `${base}?level=varsity&idGroup=${id}`;
      try {
        const t = parseStandTables(await getText(url))[0];
        return t ? { name, url, t } : null;
      } catch { return null; }
    });
    const found = tables.filter(Boolean);
    if (!found.length) throw new Error('no districts');   // keep the last good copy
    return found;
  }) ?? []).map((x: any) => ({
    title: `District ${x.name}`, sub: `Class ${x.name.split('-')[0].replace(/^8$/, '8-player')}`, grpLabel: 'District', url: x.url,
    rows: toRows(x.t, /dist|dict/i, ranks, bySchoolName),
  }));
}

async function conferenceStandings(sport: SportDef, season: string, ranks: Map<string, RankTag>, bySchoolName: Map<string, School>): Promise<StandTable[]> {
  const confs = [...new Set(SCHOOLS.map((s) => s.conf))];
  const res = await pool(confs, 3, async (c) => cached(`conf:${sport.key}:${season}:${c}`, async () => {
    const url = `${BOUND}/ia/conferences/${c}/sports/${sport.conf}/${season}/standings`;
    // a finished season's standings don't move; check back twice a day
    return { c, url, tables: parseStandTables(await getText(url, season === seasonLabel() ? CACHE_MS : 12 * 60 * 60 * 1000)) };
  }));
  const out: StandTable[] = [];
  for (const r of res) {
    if (!r) continue;
    for (const t of r.tables) {
      if (!t.rows.some((row) => bySchoolName.has(normName(row.name)))) continue;
      const title = t.title || CONF_NAMES[r.c] || r.c.toUpperCase();
      out.push({ title: title.replace(/^MVC\b/, 'MVC'), sub: CONF_NAMES[r.c] ?? '', grpLabel: 'Conf', url: r.url, rows: toRows(t, /conf/i, ranks, bySchoolName) });
    }
  }
  return out;
}

// ── Public API ─────────────────────────────────────────────────────────────
export type SportBoard = { key: SportKey; name: string; season: string; sets: boolean; meets: boolean; live: boolean; offseason: null | { starts: string | null; year: number; finalYear: number }; games: Game[]; standings: StandTable[]; standingsNote: string; teams: { slug: string; name: string; short: string; logo: string | null; area: Area; url: string; rank: RankTag | null }[] };

export async function getBoards(now = new Date()): Promise<SportBoard[]> {
  const month = now.getMonth() + 1;
  const season = seasonLabel(now);
  // In-season sports, plus the ones we keep up year-round (soccer: next spring's
  // schedule, last spring's final standings and rankings).
  const sports = SCORE_SPORTS.filter((s) => inSeason(s, month) || FINAL_OFFSEASON.includes(s.key));
  const shift = (label: string, by: number) => { const y = +label.slice(0, 4) + by; return `${y}-${String((y + 1) % 100).padStart(2, '0')}`; };
  const polls = new Map((await getRankings().catch(() => [])).map((s) => [s.key, s.poll]));
  const bySchoolName = new Map<string, School>();
  for (const s of SCHOOLS) { bySchoolName.set(normName(s.name), s); }
  // Bound's own spellings for a few schools
  bySchoolName.set(normName('Xavier'), SCHOOLS.find((s) => s.slug === 'xavier')!);
  bySchoolName.set(normName('Regina'), SCHOOLS.find((s) => s.slug === 'regina')!);
  bySchoolName.set(normName('Regina Catholic'), SCHOOLS.find((s) => s.slug === 'regina')!);
  bySchoolName.set(normName('Prairie'), SCHOOLS.find((s) => s.slug === 'crprairie')!);

  return Promise.all(sports.map(async (sport) => {
    const ranks = rankMap(sport.rankKey ? polls.get(sport.rankKey) : null);
    const live = inSeason(sport, month);
    // Off-season: which school year is coming up, and which one just finished?
    const justEnded = !live && month > sport.season[1] && month < 8 && sport.season[0] <= sport.season[1];
    const schedSeason = live ? season : justEnded ? shift(season, 1) : season;
    const standSeason = live ? season : justEnded ? season : shift(season, -1);
    const scheds = await pool(SCHOOLS, 3, (s) => teamSchedule(sport, schedSeason, s, live ? CACHE_MS : 12 * 60 * 60 * 1000));
    const games = new Map<string, Game>();
    const teams: SportBoard['teams'] = [];
    for (const sc of scheds) {
      if (!sc || sc.missing) continue;
      // Bound's display name for the school is what opponents' rows use
      teams.push({ slug: sc.team.school.slug, name: sc.team.school.name, short: sc.team.school.short, logo: sc.team.logo, area: sc.team.school.area, url: sc.team.url, rank: findRank(ranks, sc.team.school.name) });
      for (const r of sc.rows) {
        const g = sport.kind === 'meet' ? toMeet(sc.team, r) : toGame(sc.team, r, ranks, bySchoolName);
        if (!g) continue;
        const prev = games.get(g.id);
        if (prev) {
          prev.schools = [...new Set([...prev.schools, ...g.schools])];
          if (g.field) prev.field = [...(prev.field ?? []), ...g.field.filter((f) => !prev.field?.some((x) => x.school === f.school))];
          if (g.final) prev.final = true;
          continue;
        }
        games.set(g.id, g);
      }
    }
    const list = [...games.values()].sort((a, b) => a.date.localeCompare(b.date) || (toMin(a.time) - toMin(b.time)));
    const standingsRaw = sport.kind === 'meet' ? []     // track keeps no standings
      : sport.districts
      ? await footballDistricts(sport, standSeason, ranks, bySchoolName).catch(() => [])
      : await conferenceStandings(sport, standSeason, ranks, bySchoolName).catch(() => []);
    // tables with the most Corridor schools first (MVC / big-school districts lead)
    const ours = (t: StandTable) => t.rows.filter((r) => r.school).length;
    const standings = [...standingsRaw].sort((a, b) => ours(b) - ours(a));
    return {
      key: sport.key, name: sport.name, season: schedSeason, sets: !!sport.sets, meets: sport.kind === 'meet', games: list, standings, teams, live,
      offseason: live ? null : { starts: list.find((g) => g.date >= new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }))?.date ?? null, year: +schedSeason.slice(0, 4) + 1, finalYear: +standSeason.slice(0, 4) + 1 },
      standingsNote: sport.kind === 'meet' ? 'Track and field doesn’t keep standings: teams are scored meet by meet. Finishes are under Scores, and the state meet at Drake decides the championships.'
        : sport.districts ? 'Football plays for district titles, so these are the IHSAA districts our schools are in.'
        : live ? 'Conference standings for the leagues our schools play in.'
        : `Final ${+standSeason.slice(0, 4) + 1} conference standings. The ${+schedSeason.slice(0, 4) + 1} season starts in ${['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][sport.season[0]]}.`,
    };
  }));
}
const toMin = (t: string | null) => { if (!t) return 9999; const m = /(\d+):(\d+)\s*([AP])M/i.exec(t); if (!m) return 9999; return ((+m[1] % 12) + (m[3].toUpperCase() === 'P' ? 12 : 0)) * 60 + +m[2]; };
