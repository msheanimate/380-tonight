// src/lib/rankings.ts
//
// Iowa high school state rankings for the High School page. Where the
// governing body / poll publishes a parseable list we show the current top 10
// per class (a factual list, credited and linked); every other sport links to
// its official or best-known rankings. Same refresh model as news.ts:
// per-request in dev (cached CACHE_MS), at build time in production.

export type RankRow = { rank: number; school: string; record: string; lw: string };
export type RankClass = { name: string; rows: RankRow[] };
export type Poll = { title: string; date: string | null; url: string; source: string; classes: RankClass[] };
export type Sport = {
  key: string; name: string; who: 'Boys' | 'Girls' | 'Boys & girls';
  season: [number, number];            // months in season, 1-12 (inclusive, wraps)
  seasonLabel: string;
  links: { label: string; url: string }[];
  note?: string;                       // shown instead of a poll when there isn't one
  poll?: Poll | null;
};

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; The380 rankings reader)' };
const CACHE_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; val: any }>();
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.val;
  try { const val = await fn(); cache.set(key, { at: Date.now(), val }); return val; }
  catch { return hit?.val ?? null; }
}
async function getText(url: string) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(String(r.status));
  return r.text();
}
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ', hellip: '…' };
const decode = (s: string) => s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&([a-z]+);/gi, (m, n) => ENT[n] ?? m);
const text = (html: string) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// ── IGHSAU (girls): weekly "Rankings" news posts with one table per class ──
async function ighsau(sport: 'volleyball' | 'basketball' | 'softball' | 'soccer'): Promise<Poll | null> {
  return cached(`ighsau:${sport}`, async () => {
    // The ?c= filter isn't reliable for every sport; the per-sport news list is.
    const list = await getText(sport === 'soccer' ? 'https://ighsau.org/news/sport/soccer' : `https://ighsau.org/news/?c=${sport}-rankings`);
    const m = new RegExp(`href="(/news/[^"]*${sport}-rankings[^"]*)"`, 'i').exec(list);
    if (!m) return null;
    const url = 'https://ighsau.org' + m[1];
    const page = await getText(url);
    const title = text((/<h4[^>]*>([\s\S]*?)<\/h4>/.exec(page) || [, ''])[1]) || `${sport} rankings`;
    const date = text((/<h4[^>]*>[\s\S]*?<\/h4>\s*<p[^>]*>([\s\S]*?)<\/p>/.exec(page) || [, ''])[1]) || null;
    const classes: RankClass[] = [];
    const re = /<strong>\s*(Class\s*[^<]{1,12})<\/strong>[\s\S]*?<table[\s\S]*?<\/table>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = re.exec(page))) {
      const tbl = cm[0].slice(cm[0].indexOf('<table'));
      const rows: RankRow[] = [];
      for (const tr of tbl.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
        const cells = (tr.match(/<td[\s\S]*?<\/td>/g) ?? []).map(text);
        const rank = parseInt(cells[0], 10);
        if (!rank || !cells[1]) continue;
        rows.push({ rank, school: cells[1], record: cells[2] ?? '', lw: cells[3] ?? '' });
      }
      if (rows.length) classes.push({ name: text(cm[1]), rows: rows.slice(0, 10) });
    }
    return classes.length ? { title, date, url, source: 'IGHSAU', classes } : null;
  });
}

// ── Radio Iowa weekly football poll: "Class 5A 1. Southeast Polk (4-0), LW #2 @ Ottumwa 2. ..." ──
async function radioIowaFootball(): Promise<Poll | null> {
  return cached('radioiowa:football', async () => {
    const feed = await getText('https://www.radioiowa.com/category/sports/feed/');
    const item = (feed.match(/<item>[\s\S]*?<\/item>/g) ?? []).find((i) => /Football Poll/i.test(i));
    if (!item) return null;
    const url = (/<link>([^<]+)<\/link>/.exec(item) || [, ''])[1].trim();
    const title = text((/<title>([\s\S]*?)<\/title>/.exec(item) || [, ''])[1]);
    const date = (/<pubDate>([^<]+)<\/pubDate>/.exec(item) || [, null])[1];
    const page = await getText(url);
    const body = (/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<(?:footer|div[^>]*class="[^"]*(?:sharedaddy|post-tags|entry-footer))/i.exec(page) || /<article[\s\S]*?<\/article>/i.exec(page) || [page, page])[1];
    const flat = text(body);
    const classes: RankClass[] = [];
    const parts = flat.split(/\b(Class\s+(?:[1-5]A|A|8-Player|Eight-Player))\b/i);
    for (let i = 1; i < parts.length; i += 2) {
      const name = parts[i].replace(/\s+/g, ' ');
      const rows: RankRow[] = [];
      const rowRe = /(\d{1,2})\.\s+(.+?)\s+\((\d+-\d+)\),?\s*(?:LW\s*#?(\d+|NR|nr))?/g;
      let r: RegExpExecArray | null;
      while ((r = rowRe.exec(parts[i + 1])) && rows.length < 10) rows.push({ rank: +r[1], school: r[2].trim(), record: r[3], lw: r[4] ?? '' });
      if (rows.length && !classes.some((c) => c.name === name)) classes.push({ name, rows });
    }
    return classes.length ? { title, date: date ? new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null, url, source: 'Radio Iowa', classes } : null;
  });
}

// ── IHSAA boys' soccer: one "Soccer: {year} Rankings" post, newest week's tables first ──
async function ihsaaSoccer(): Promise<Poll | null> {
  return cached('ihsaa:soccer', async () => {
    const hub = await getText('https://www.iahsaa.org/soccer/');
    const m = /href="(https:\/\/www\.iahsaa\.org\/soccer-(\d{4})-rankings\/?)"/i.exec(hub);
    if (!m) return null;
    const page = await getText(m[1]);
    const date = (/datetime="([^"]+)"/.exec(page) || [])[1] ?? null;
    const classes: RankClass[] = [];
    const re = /CLASS\s+(\dA)\s*<\/p>\s*<figure[^>]*>\s*(<table[\s\S]*?<\/table>)/gi;
    let cm: RegExpExecArray | null;
    while ((cm = re.exec(page))) {
      const name = `Class ${cm[1]}`;
      if (classes.some((c) => c.name === name)) continue;      // later tables are earlier weeks
      const rows: RankRow[] = [];
      for (const tr of cm[2].match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
        const c = (tr.match(/<td[\s\S]*?<\/td>/g) ?? []).map(text);
        const rank = parseInt(c[0], 10);
        if (!rank || !c[1]) continue;
        // IHSAA writes both "Prairie, Cedar Rapids" and "Dubuque, Senior": put the city first either way
        const [x, y] = c[1].split(/,\s*/);
        const CITY = /^(cedar rapids|iowa city|des moines|west des moines|dubuque|davenport|sioux city|council bluffs|waterloo|cedar falls|ames|ankeny)$/i;
        const school = y === undefined ? c[1] : CITY.test(y) ? `${y} ${x}` : `${x} ${y}`;
        rows.push({ rank, school, record: [c[2], c[3], c[4]].filter((x) => x !== undefined && x !== '').join('-'), lw: '' });
      }
      if (rows.length) classes.push({ name, rows: rows.slice(0, 10) });
    }
    return classes.length ? { title: `Soccer: ${m[2]} Rankings`, date: date ? new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null, url: m[1], source: 'IHSAA', classes } : null;
  });
}

const SPORTS: Omit<Sport, 'poll'>[] = [
  { key: 'football', name: 'Football', who: 'Boys', season: [8, 11], seasonLabel: 'Aug–Nov',
    links: [{ label: 'IHSAA official', url: 'https://www.iahsaa.org/football/' }, { label: 'MaxPreps', url: 'https://www.maxpreps.com/ia/football/rankings/1/' }] },
  { key: 'volleyball', name: 'Volleyball', who: 'Girls', season: [8, 11], seasonLabel: 'Aug–Nov',
    links: [{ label: 'IGHSAU official', url: 'https://ighsau.org/news/?c=volleyball-rankings' }, { label: 'MaxPreps', url: 'https://www.maxpreps.com/ia/volleyball/rankings/1/' }] },
  { key: 'gbb', name: 'Girls basketball', who: 'Girls', season: [11, 3], seasonLabel: 'Nov–Mar',
    links: [{ label: 'IGHSAU official', url: 'https://ighsau.org/news/?c=basketball-rankings' }, { label: 'MaxPreps', url: 'https://www.maxpreps.com/ia/basketball/girls/rankings/1/' }] },
  { key: 'bbb', name: 'Boys basketball', who: 'Boys', season: [11, 3], seasonLabel: 'Nov–Mar',
    links: [{ label: 'IHSAA official', url: 'https://www.iahsaa.org/basketball/' }, { label: 'MaxPreps', url: 'https://www.maxpreps.com/ia/basketball/rankings/1/' }] },
  { key: 'wrestling', name: 'Wrestling', who: 'Boys & girls', season: [11, 2], seasonLabel: 'Nov–Feb',
    links: [{ label: 'IAwrestle', url: 'https://iawrestle.com/category/rankings/' }, { label: 'IHSAA', url: 'https://www.iahsaa.org/wrestling/' }] },
  { key: 'bsoc', name: 'Boys soccer', who: 'Boys', season: [3, 6], seasonLabel: 'Mar–Jun',
    links: [{ label: 'IHSAA official', url: 'https://www.iahsaa.org/soccer/' }, { label: 'MaxPreps', url: 'https://www.maxpreps.com/ia/soccer/rankings/1/' }] },
  { key: 'gsoc', name: 'Girls soccer', who: 'Girls', season: [3, 6], seasonLabel: 'Mar–Jun',
    links: [{ label: 'IGHSAU official', url: 'https://ighsau.org/news/sport/soccer' }, { label: 'MaxPreps', url: 'https://www.maxpreps.com/ia/soccer/girls/rankings/1/' }] },
  { key: 'btrack', name: 'Boys track', who: 'Boys', season: [3, 5], seasonLabel: 'Mar–May',
    note: 'Iowa has no official weekly track poll. Top marks and state-meet results live here:',
    links: [{ label: 'IHSAA state meet', url: 'https://www.iahsaa.org/track-field/state-meet-central/' }, { label: 'MileSplit Iowa', url: 'https://ia.milesplit.com/' }, { label: 'Athletic.net', url: 'https://www.athletic.net/' }] },
  { key: 'gtrack', name: 'Girls track', who: 'Girls', season: [3, 5], seasonLabel: 'Mar–May',
    note: 'Iowa has no official weekly track poll. Top marks and state-meet results live here:',
    links: [{ label: 'IGHSAU', url: 'https://ighsau.org/' }, { label: 'MileSplit Iowa', url: 'https://ia.milesplit.com/' }, { label: 'Athletic.net', url: 'https://www.athletic.net/' }] },
  { key: 'softball', name: 'Softball', who: 'Girls', season: [5, 7], seasonLabel: 'May–Jul',
    links: [{ label: 'IGHSAU official', url: 'https://ighsau.org/news/?c=softball-rankings' }, { label: 'MaxPreps', url: 'https://www.maxpreps.com/ia/softball/rankings/1/' }] },
  { key: 'baseball', name: 'Baseball', who: 'Boys', season: [5, 7], seasonLabel: 'May–Jul',
    links: [{ label: 'IHSAA', url: 'https://www.iahsaa.org/baseball/' }, { label: 'MaxPreps', url: 'https://www.maxpreps.com/ia/baseball/rankings/1/' }] },
];

export function inSeason(s: { season: [number, number] }, month = new Date().getMonth() + 1) {
  const [a, b] = s.season;
  return a <= b ? month >= a && month <= b : month >= a || month <= b;
}

/** Sports whose final rankings stay up between seasons. */
export const FINAL_OFFSEASON = ['bsoc', 'gsoc', 'btrack', 'gtrack'];

/** Every sport, in-season first, with a live top-10 poll where we can get one. */
export async function getRankings(): Promise<Sport[]> {
  const [football, volleyball, gbb, softball, bsoc, gsoc] = await Promise.all([
    radioIowaFootball().catch(() => null), ighsau('volleyball').catch(() => null),
    ighsau('basketball').catch(() => null), ighsau('softball').catch(() => null),
    ihsaaSoccer().catch(() => null), ighsau('soccer').catch(() => null),
  ]);
  const polls: Record<string, Poll | null> = { football, volleyball, gbb, softball, bsoc, gsoc };
  // Soccer also shows last spring's final poll in the off-season.
  const showOff = new Set(FINAL_OFFSEASON);
  return SPORTS
    .map((s) => ({ ...s, poll: inSeason(s) || showOff.has(s.key) ? polls[s.key] ?? null : null }))
    .sort((a, b) => Number(inSeason(b)) - Number(inSeason(a)) || Number(!!b.poll) - Number(!!a.poll));
}

/** Corridor schools, highlighted in the tables. */
export const CORRIDOR_RE = /\b(iowa city|cedar rapids|linn-mar|marion|liberty|regina|xavier|solon|clear creek|mount vernon|center point|lisbon|alburnett|north linn|springville|west branch|tipton|williamsburg|lone tree|mid-prairie|iowa valley|highland|cr kennedy|cr washington|cr jefferson|cr prairie|kennedy|washington|jefferson|prairie)\b/i;
