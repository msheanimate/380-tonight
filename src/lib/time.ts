// Central-time helpers shared by the build (Astro frontmatter) and the
// browser. The site is static, so anything "right now" -- the kickoff
// countdown, which happy hours are on -- has to be worked out client-side,
// and always in America/Chicago regardless of where the visitor is.
export const TZ = 'America/Chicago';

/** Epoch ms for a wall-clock time in `tz` (handles DST by iterating once). */
export function zonedToEpoch(dateStr: string, hh: number, mm: number, tz = TZ): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const offset = tzOffsetMs(guess, tz);
    guess = Date.UTC(y, m - 1, d, hh, mm) - offset;
  }
  return guess;
}

/** Offset of `tz` from UTC at the given instant, in ms (Chicago: -5h or -6h). */
export function tzOffsetMs(epoch: number, tz = TZ): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(epoch));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(epoch / 1000) * 1000;
}

/** "2:30 PM" / "11:00 AM" -> [14, 30]; null for TBA or anything unparseable. */
export function parseClock(s: string | null | undefined): [number, number] | null {
  if (!s) return null;
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(s.trim());
  if (!m) return null;
  let h = Number(m[1]); const min = Number(m[2] ?? 0);
  const ap = m[3]?.toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return [h, min];
}

/** The wall clock in `tz` right now: weekday 0-6 (Sun=0) and minutes since midnight. */
export function nowInZone(tz = TZ, at = Date.now()): { dow: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', weekday: 'short', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(at));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { dow, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** "1d 4h", "2h 05m", "14m 09s" -- for countdowns. */
export function fmtDuration(ms: number, withSeconds = false): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return withSeconds ? `${m}m ${String(sec).padStart(2, '0')}s` : `${m}m`;
}
