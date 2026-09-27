// src/lib/news.ts
//
// Local news + sports headlines for /news/ and /sports/, pulled from the
// outlets' own public RSS/Atom feeds. We only show what a feed reader would:
// headline, a short summary, the photo the feed provides, and a link out --
// every story opens on the outlet's site.
//
// In `astro dev` the pages re-render per request, so headlines refresh every
// CACHE_MS. In a static build they're fetched once at build time -- rebuild
// (or schedule a daily deploy) to refresh. A feed that fails is skipped.

export type Kind = 'news' | 'sports' | 'preps';
export type Article = {
  title: string; link: string; date: string; // ISO
  source: string; sourceSlug: string; summary: string; image: string | null;
};
type Parsed = Article & { text: string };   // text = title + body, for filtering
type Feed = { url: string; source: string; slug: string; localOnly?: boolean; onlyIf?: RegExp; notIf?: RegExp; match?: (title: string, text: string) => boolean };

// High school sports: prep terms, TV segment names, and Iowa's high schools
// and mascots (Corridor first, then the big programs they play).
const PREPS_RE = new RegExp('\\b(' + [
  'high school', 'prep', 'preps', 'varsity', 'homecoming', 'state (?:tournament|meet|qualif\\w*|champion\\w*|poll)', 'football poll',
  'class [1-5]a', '[1-5]a\\b', '8-player', 'ihsaa', 'ighsau',
  // TV/radio segments
  'friday night lights', 'endzone', 'eiot', 'eastern iowa ot', 'friday night blitz', 'football friday', 'ffp', 'game of the week', 'athlete of the week',
  // Corridor schools + mascots
  'city high', 'little hawks', 'west high', 'trojans', 'iowa city liberty', 'liberty lightning', 'liberty (?:high|volleyball|football|soccer|girls|boys)',
  'regina', 'regals', 'kennedy', 'cr washington', 'cedar rapids washington', 'jefferson', 'j-hawks', 'prairie', 'xavier', 'saints', 'linn-mar',
  'marion (?:high|indians|wolves)', 'mount vernon', 'solon', 'clear creek[- ]amana', 'center point', 'lisbon', 'williamsburg', 'west branch',
  'tipton', 'north linn', 'alburnett', 'springville', 'iowa valley', 'highland', 'lone tree', 'mid-prairie', 'independence', 'vinton', 'benton community',
  'principal\\S?s bell',
  // Around the state
  'dowling', 'waukee', 'ankeny', 'southeast polk', 'johnston', 'urbandale', 'wdm valley', 'west des moines', 'dallas center', 'dcg', 'adm',
  'waterloo (?:west|east|columbus)', 'cedar falls', 'dubuque (?:senior|hempstead|wahlert)', 'wahlert', 'hempstead', 'bettendorf', 'pleasant valley',
  'north scott', 'davenport (?:central|north|west)', 'muscatine', 'ottumwa', 'fort dodge', 'lewis central', 'mason city', 'marshalltown',
  'pella', 'norwalk', 'indianola', 'grinnell', 'van meter', 'wapsie valley', 'maquoketa', 'don bosco', 'gladbrook', 'janesville', 'dike-new hartford',
].join('|') + ')\\b', 'i');

// ...but not college/pro stories that happen to mention a high school.
const COLLEGE_RE = /\b(hawkeyes?|iowa (?:men|women)[’']s|for iowa\b|no\. \d+ iowa\b|iowa (?:beats|stuns|drives|falls|wins|loses|looks)|big ten|big 12|ncaa|iowa state|cyclones|northern iowa|uni\b|panthers|kinnick|carver-hawkeye|college gameday|fcs|fbs|nfl|nba|mlb|wnba|nhl|utes|utah|michigan|illinois state|dordt|morningside|coe college|kirkwood eagles|mount mercy|upper iowa|marathon|world record|fiba|world cup|olympic\w*|fever|lynx|mystics|caitlin clark|cy-hawk|ferentz|mr\. soundoff|texas|california|florida|georgia|alabama|kansas|missouri)\b/i;

// A game result in the headline ("Dowling crushes Waterloo West 55-0") from a
// station's sports feed is almost always prep on a Friday -- count it,
// unless it's clearly college/pro.
const SCORE_RE = /\b\d{1,2}-\d{1,2}\b/;
const isPrep = (title: string, text: string) =>
  !COLLEGE_RE.test(title) && (PREPS_RE.test(title) || PREPS_RE.test(text.slice(0, 400)) || SCORE_RE.test(title));

// For regional outlets (KCRG covers all of eastern Iowa + national wire
// stories), keep only stories that mention the Corridor.
const LOCAL_RE = /\b(iowa city|cedar rapids|coralville|north liberty|marion|hiawatha|solon|tiffin|swisher|ely|robins|fairfax|johnson county|linn county|university of iowa|ui\b|hawkeyes?|kinnick|kirkwood|coe college|mount mercy|corridor|newbo|czech village|ped mall)/i;

export const FEEDS: Record<Kind, Feed[]> = {
  news: [
    { url: 'https://www.kcrg.com/arc/outboundfeeds/rss/?outputType=xml&size=60', source: 'KCRG', slug: 'kcrg', localOnly: true },
    { url: 'https://cbs2iowa.com/news/local.rss', source: 'CBS2 Iowa', slug: 'cbs2', localOnly: true },
    { url: 'https://dailyiowan.com/category/news/feed/', source: 'The Daily Iowan', slug: 'daily-iowan' },
    { url: 'https://littlevillagemag.com/feed/', source: 'Little Village', slug: 'little-village' },
    { url: 'https://corridorbusiness.com/feed/', source: 'Corridor Business Journal', slug: 'cbj' },
  ],
  sports: [
    { url: 'https://hawkeyesports.com/feed/', source: 'Hawkeye Sports', slug: 'hawkeye-sports' },
    { url: 'https://www.kcrg.com/arc/outboundfeeds/rss/category/sports/?outputType=xml&size=100', source: 'KCRG Sports', slug: 'kcrg-sports' },
    { url: 'https://cbs2iowa.com/sports.rss', source: 'CBS2 Iowa', slug: 'cbs2' },
    { url: 'https://dailyiowan.com/category/sports/feed/', source: 'The Daily Iowan', slug: 'daily-iowan' },
    { url: 'https://hawkfanatic.com/feed/', source: 'HawkFanatic', slug: 'hawkfanatic' },
    { url: 'https://www.blackheartgoldpants.com/rss/current.xml', source: 'Black Heart Gold Pants', slug: 'bhgp' },
  ],
  preps: [
    { url: 'https://cbs2iowa.com/sports.rss', source: 'CBS2 Iowa', slug: 'cbs2', match: isPrep },
    { url: 'https://www.kcrg.com/arc/outboundfeeds/rss/category/sports/?outputType=xml&size=100', source: 'KCRG Sports', slug: 'kcrg-sports', match: isPrep },
    { url: 'https://www.kwwl.com/search/?f=rss&t=article&c=sports*&l=50&s=start_time&sd=desc', source: 'KWWL', slug: 'kwwl', match: isPrep },
    { url: 'https://who13.com/sports/feed/', source: 'WHO 13', slug: 'who13', match: isPrep },
    { url: 'https://www.weareiowa.com/feeds/syndication/rss/sports', source: 'WOI We Are Iowa', slug: 'woi', match: isPrep },
    { url: 'https://www.radioiowa.com/category/sports/feed/', source: 'Radio Iowa', slug: 'radio-iowa', match: (t) => /high school|prep|varsity|state (?:tournament|meet)/i.test(t) },
    { url: 'https://www.iahsaa.org/feed/', source: 'IHSAA', slug: 'ihsaa' },
  ],

};

const CACHE_MS = 15 * 60 * 1000;
const PER_SOURCE = 12;
const MAX_AGE_DAYS = 21;
const cache = new Map<string, { at: number; items: Parsed[] }>();

// ── tiny, forgiving RSS/Atom parsing (no dependency) ──────────────────────
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}
const unCdata = (s: string) => s.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '');
function tag(block: string, name: string): string {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i').exec(block);
  return m ? unCdata(m[1]).trim() : '';
}
function attr(block: string, re: RegExp): string | null {
  const m = re.exec(block);
  return m ? decode(m[1]) : null;
}
function stripHtml(html: string): string {
  return decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function summarize(raw: string): string {
  let t = stripHtml(raw).replace(/The post .+? appeared first on .+?\.?$/i, '').replace(/\[…\]|\[\.\.\.\]/g, '…').trim();
  if (t.length > 190) t = t.slice(0, 190).replace(/\s+\S*$/, '') + '…';
  return t;
}
function parse(xml: string, feed: Feed): Parsed[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/g) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/g) ?? [];
  const out: Parsed[] = [];
  for (const b of blocks) {
    const title = stripHtml(tag(b, 'title'));
    const link = tag(b, 'link') || attr(b, /<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i) || attr(b, /<link[^>]*href="([^"]+)"/i) || '';
    const when = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
    const d = new Date(when);
    if (!title || !/^https?:/.test(link) || isNaN(d.getTime())) continue;
    const body = tag(b, 'description') || tag(b, 'summary') || '';
    const content = tag(b, 'content:encoded') || tag(b, 'content') || '';

    const image =
      attr(b, /<media:content[^>]*url="([^"]+)"/i) ||
      attr(b, /<media:thumbnail[^>]*url="([^"]+)"/i) ||
      attr(b, /<enclosure[^>]*url="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/i) ||
      attr(unCdata(body) + unCdata(content), /<img[^>]*\ssrc="([^"]+)"/i);
    out.push({
      title, link: decode(link.trim()), date: d.toISOString(),
      source: feed.source, sourceSlug: feed.slug,
      summary: summarize(body || content), image: image && /^https?:/.test(image) ? image : null,
      text: title + ' ' + stripHtml(body) + ' ' + stripHtml(content).slice(0, 800),
    });
  }
  return out;
}

async function fetchRaw(url: string, feed: Feed): Promise<Parsed[]> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.items;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; The380 local news reader)' }, signal: AbortSignal.timeout(9000) });
    if (!r.ok) throw new Error(String(r.status));
    const items = parse(await r.text(), feed);
    cache.set(url, { at: Date.now(), items });
    return items;
  } catch {
    return hit?.items ?? [];   // stale beats nothing
  }
}

/** One feed's articles, filtered for this section and labeled as this feed. */
async function fetchFeed(feed: Feed): Promise<Article[]> {
  const raw = await fetchRaw(feed.url, feed);
  return raw
    .filter((a) => (!feed.localOnly || LOCAL_RE.test(a.text)) && (!feed.onlyIf || feed.onlyIf.test(a.text)) && (!feed.notIf || !feed.notIf.test(a.title)) && (!feed.match || feed.match(a.title, a.text)))
    .slice(0, PER_SOURCE)
    .map(({ text, ...a }) => ({ ...a, source: feed.source, sourceSlug: feed.slug }));
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 70);

export async function getArticles(kind: Kind): Promise<Article[]> {
  const lists = await Promise.all(FEEDS[kind].map(fetchFeed));
  let all = lists.flat();
  if (kind === 'news') {
    // KCRG's main feed mixes in sports; drop anything that's in its sports feed.
    const kcrgSports = FEEDS.sports.find((f) => f.slug === 'kcrg-sports')!;
    const sportsLinks = new Set((await fetchRaw(kcrgSports.url, kcrgSports)).map((a) => a.link));
    all = all.filter((a) => !sportsLinks.has(a.link));
  }
  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
  const seen = new Set<string>();
  return all
    .filter((a) => new Date(a.date).getTime() >= cutoff)
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((a) => { const k = norm(a.title); if (seen.has(k)) return false; seen.add(k); return true; });
}
