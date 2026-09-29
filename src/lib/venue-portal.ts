// src/lib/venue-portal.ts
//
// The venue portal: bar owners (approved "venue managers") keep their own page
// current from /manage/, and you approve them from /admin/. Tables live in
// supabase/venue-portal.sql. Everything is publicly readable -- it's shown on
// the venue pages -- and only an approved manager of that venue, or an admin,
// can write. The site itself stays static: venue pages fetch this live on load,
// so owners' edits show up immediately without a rebuild.

import { supabase, supabaseConfigured } from './supabase';

export type HappyWindow = { days: number[]; start: string; end: string; deal?: string };
export type DaySpecial = { day: number; food?: string[]; drinks?: string[]; event?: string };
export type VenueContent = {
  venue_slug: string; blurb: string | null; hours_note: string | null; phone: string | null;
  website: string | null; menu_url: string | null; menu_text: string | null;
  happy_hours: HappyWindow[] | null; specials: DaySpecial[] | null; updated_at: string;
};
export type VenueEvent = {
  id: number; venue_slug: string; title: string; event_date: string; start_time: string | null;
  price: string | null; category: string; blurb: string | null; ticket_url: string | null; created_at: string;
};
export type VenuePost = { id: number; venue_slug: string; body: string; image_url: string | null; image_path: string | null; created_at: string };
export type VenuePhoto = { id: number; venue_slug: string; kind: 'gallery' | 'party' | 'menu'; storage_path: string; url: string; caption: string | null; taken_on: string | null; created_at: string };
export type ManagerRow = { id: number; user_id: string; venue_slug: string; status: 'pending' | 'approved' | 'denied'; note: string | null; created_at: string; decided_at: string | null };

export const BUCKET = 'venue-media';
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const todayCT = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());

export const portalReady = () => supabaseConfigured && !!supabase;

/** Everything a venue page shows from its owner, in one go. Missing tables (SQL not run yet) just come back empty. */
export async function loadVenueLive(slug: string) {
  const empty = { content: null as VenueContent | null, events: [] as VenueEvent[], posts: [] as VenuePost[], photos: [] as VenuePhoto[] };
  if (!supabase) return empty;
  const [c, e, p, ph] = await Promise.all([
    supabase.from('venue_content').select('*').eq('venue_slug', slug).maybeSingle(),
    supabase.from('venue_events').select('*').eq('venue_slug', slug).gte('event_date', todayCT()).order('event_date').limit(40),
    supabase.from('venue_posts').select('*').eq('venue_slug', slug).order('created_at', { ascending: false }).limit(20),
    supabase.from('venue_photos').select('*').eq('venue_slug', slug).order('created_at', { ascending: false }).limit(120),
  ]);
  return {
    content: (c.data as VenueContent) ?? null,
    events: (e.data as VenueEvent[]) ?? [],
    posts: (p.data as VenuePost[]) ?? [],
    photos: (ph.data as VenuePhoto[]) ?? [],
  };
}

/** Upload a file into the venue's folder; returns its storage path and public URL. */
export async function uploadVenueFile(slug: string, file: File, kind: string) {
  if (!supabase) throw new Error('Accounts are not set up yet.');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
  const path = `${slug}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

export async function removeVenueFile(path: string | null | undefined) {
  if (!supabase || !path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}

export const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const fmtClock = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  if (!m) return t || '';
  const h = +m[1], mm = +m[2];
  return `${h % 12 || 12}${mm ? ':' + String(mm).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`;
};
export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('en-US', opts);
export const timeAgo = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString();
};
/** "Mon–Fri", "Sat, Sun", "Every day" */
export function daysLabel(days: number[]) {
  const d = [...new Set(days)].sort((a, b) => a - b);
  if (d.length === 7) return 'Every day';
  const runs: string[] = [];
  let i = 0;
  while (i < d.length) {
    let j = i;
    while (j + 1 < d.length && d[j + 1] === d[j] + 1) j++;
    runs.push(j - i >= 2 ? `${DAY_SHORT[d[i]]}–${DAY_SHORT[d[j]]}` : d.slice(i, j + 1).map((x) => DAY_SHORT[x]).join(', '));
    i = j + 1;
  }
  return runs.join(', ');
}

/** "Mon–Fri 4 PM–6 PM · $1 off draws; Sat 2 PM–5 PM" -- the one-line form the Drink page and cards use. */
export function happySummary(ws: HappyWindow[]) {
  return ws.map((w) => {
    const days = daysLabel(w.days).replace('Every day', 'Daily');
    const end = w.end === 'close' ? 'close' : fmtClock(w.end);
    const deal = (w.deal ?? '').split('\n').map((s) => s.trim()).filter(Boolean).join(', ');
    return `${days} ${fmtClock(w.start)}–${end}${deal ? ` · ${deal}` : ''}`;
  }).join('; ');
}

/** Is any window running at this Central-time weekday/minute? "close" counts as 2 AM. */
export function happyOnNow(ws: { days: number[]; start: string; end: string }[], dow: number, minutes: number) {
  const mins = (t: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t); return m ? +m[1] * 60 + +m[2] : NaN; };
  return ws.some((w) => {
    const a = mins(w.start);
    let b = w.end === 'close' ? 26 * 60 : mins(w.end);
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    if (b <= a) b += 24 * 60;
    if (w.days.includes(dow) && minutes >= a && minutes < b) return true;
    // a window that started yesterday and runs past midnight
    const prev = (dow + 6) % 7;
    return w.days.includes(prev) && minutes + 24 * 60 >= a && minutes + 24 * 60 < b;
  });
}

/** What owners have saved on the Happy hours & specials tab, keyed by slug.
 *  `null` means that venue never saved it, so the site's own listing stands;
 *  an empty array means the owner cleared it. */
export type LiveDeal = { happy_hours: HappyWindow[] | null; specials: DaySpecial[] | null; summary: string; lines: string[] };
export async function loadLiveDeals(): Promise<Record<string, LiveDeal>> {
  const out: Record<string, LiveDeal> = {};
  if (!supabase) return out;
  const { data, error } = await supabase.from('venue_content').select('venue_slug, happy_hours, specials')
    .or('happy_hours.not.is.null,specials.not.is.null');
  if (error) return out;
  for (const r of (data ?? []) as { venue_slug: string; happy_hours: HappyWindow[] | null; specials: DaySpecial[] | null }[]) {
    const hh = Array.isArray(r.happy_hours) ? r.happy_hours : null;
    out[r.venue_slug] = {
      happy_hours: hh, specials: Array.isArray(r.specials) ? r.specials : null,
      summary: hh ? happySummary(hh) : '', lines: hh ? hh.map((w) => happySummary([w])) : [],
    };
  }
  return out;
}

/** Owner deals, loaded once per page by Base.astro. Resolves on the `live-deals` event. */
export function onLiveDeals(fn: (deals: Record<string, LiveDeal>) => void) {
  const w = window as unknown as { __liveDeals?: Record<string, LiveDeal> };
  if (w.__liveDeals) fn(w.__liveDeals);
  else document.addEventListener('live-deals', (e) => fn((e as CustomEvent).detail), { once: true });
}
