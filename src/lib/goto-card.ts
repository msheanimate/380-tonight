// src/lib/goto-card.ts  (browser)
//
// The "go-to" card on /profile/ and /u/: logo, name, open/closed right now,
// address (opens maps) and a tap-to-call phone number. Data comes from
// gotoIndex() in goto-index.ts, embedded in the page at build time.

import { nowInZone } from './time';

export type GotoVenue = {
  slug: string; name: string; city: string; kind: string; address: string; maps: string;
  phone: string; hours: string[] | null; logo: string | null; mono: string;
};

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toMin = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(2, 4);
function clock(min: number) {
  const m = ((min % 1440) + 1440) % 1440, h = Math.floor(m / 60), mm = m % 60;
  if (m === 0) return 'midnight';
  return `${h % 12 || 12}${mm ? ':' + String(mm).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`;
}
/** A day's ranges as [start, end] minutes; an end past midnight runs into the next day. */
function ranges(day: string): [number, number][] {
  return (day || '').split(',').filter(Boolean).map((r) => {
    const [a, b] = r.split('-');
    const s = toMin(a); let e = toMin(b);
    if (e <= s) e += 1440;
    return [s, e];
  });
}
const dayText = (day: string) => ranges(day).map(([s, e]) => `${clock(s)}–${clock(e)}`).join(', ') || 'Closed';

/** "Open · till 2 AM", "Closed · opens 3 PM", "Closed · opens Tue 11 AM" */
export function hoursStatus(hours: string[], at = Date.now()): { open: boolean; text: string } {
  const { dow, minutes } = nowInZone(undefined, at);
  const yesterday = (dow + 6) % 7;
  for (const [s, e] of ranges(hours[yesterday])) {
    if (e > 1440 && minutes < e - 1440) return { open: true, text: `Open · till ${clock(e)}` };
  }
  for (const [s, e] of ranges(hours[dow])) {
    if (s === 0 && e === 1440) return { open: true, text: 'Open 24 hours' };
    if (minutes >= s && minutes < e) return { open: true, text: `Open · till ${clock(e)}` };
  }
  const later = ranges(hours[dow]).find(([s]) => s > minutes);
  if (later) return { open: false, text: `Closed · opens ${clock(later[0])}` };
  for (let i = 1; i <= 7; i++) {
    const d = (dow + i) % 7;
    const first = ranges(hours[d])[0];
    if (first) return { open: false, text: `Closed · opens ${i === 1 ? 'tomorrow' : DAY[d]} ${clock(first[0])}` };
  }
  return { open: false, text: 'Closed' };
}

const ICON = {
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};

export function gotoCardHtml(v: GotoVenue): string {
  const { dow } = nowInZone();
  const status = v.hours ? hoursStatus(v.hours) : null;
  const week = v.hours
    ? [1, 2, 3, 4, 5, 6, 0].map((d) => `<li${d === dow ? ' class="today"' : ''}><span>${DAY[d]}</span><span>${esc(dayText(v.hours![d]))}</span></li>`).join('')
    : '';
  const tel = v.phone.replace(/\D/g, '');
  return `<div class="goto-card">
    <a class="goto-link" href="/venues/${esc(v.slug)}/" aria-label="${esc(v.name)}"></a>
    <div class="goto-head">
      <span class="goto-logo" aria-hidden="true"><span>${esc(v.mono)}</span>${v.logo ? `<img src="${esc(v.logo)}" alt="" loading="lazy" onerror="this.remove()" onload="if(this.naturalWidth<=16)this.remove()">` : ''}</span>
      <span class="goto-title"><strong>${esc(v.name)}</strong><small>${esc(v.kind)} · ${esc(v.city)}</small></span>
    </div>
    ${status ? `<details class="goto-hours"><summary><span class="goto-ico">${ICON.clock}</span><span class="goto-status${status.open ? ' open' : ''}">${esc(status.text)}</span></summary><ul>${week}</ul></details>` : ''}
    ${v.address ? `<a class="goto-row" href="${esc(v.maps)}" target="_blank" rel="noopener"><span class="goto-ico">${ICON.pin}</span><span>${esc(v.address)}</span></a>` : ''}
    ${tel.length >= 10 ? `<a class="goto-row" href="tel:+1${tel.slice(-10)}"><span class="goto-ico">${ICON.phone}</span><span>${esc(v.phone)}</span></a>` : ''}
  </div>`;
}
