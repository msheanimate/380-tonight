// src/lib/going.ts
//
// "I'm going" for shows. Drop this markup anywhere a show is listed:
//
//   <button class="going-btn" data-show-key="..." data-slug="gabes"
//           data-date="2026-10-02" data-artist="Bayway" aria-pressed="false">
//     <span class="going-icon" aria-hidden="true">✓</span>
//     <span class="going-label">I'm going</span>
//     <span class="going-count" hidden></span>
//   </button>
//   <span class="going-friends" data-show-key="..."></span>   (optional)
//
// One delegated click listener (set up once from Base.astro) handles the
// toggle; paintGoing() fills in the count, your own state and which of your
// friends are going, via the show_going_info RPC in supabase/schema.sql.
// Anyone can see counts; friend faces only ever come from your own friend
// list, so nobody else's plans are exposed.

import { supabase, supabaseConfigured } from './supabase';
import { paintAvatar } from './avatar';
import { showKey } from './show-key';

export type GoingFriend = { username: string; display_name: string | null; avatar_url: string | null };
type GoingInfo = { going_count: number; going_by_me: boolean; friends: GoingFriend[] };

export { showKey };

const cache = new Map<string, GoingInfo>();

async function fetchInfo(keys: string[]): Promise<Map<string, GoingInfo>> {
  const out = new Map<string, GoingInfo>();
  if (!supabaseConfigured || !supabase || !keys.length) return out;
  const { data } = await supabase.rpc('show_going_info', { p_keys: keys });
  for (const row of (data || []) as any[]) {
    out.set(row.show_key, {
      going_count: Number(row.going_count) || 0,
      going_by_me: !!row.going_by_me,
      friends: Array.isArray(row.friends) ? row.friends : [],
    });
  }
  return out;
}

function paintButton(btn: HTMLElement, info: GoingInfo | undefined) {
  const going = !!info?.going_by_me;
  const count = info?.going_count ?? 0;
  btn.classList.toggle('going', going);
  btn.setAttribute('aria-pressed', String(going));
  const label = btn.querySelector<HTMLElement>('.going-label');
  if (label) label.textContent = going ? 'Going' : "I'm going";
  const countEl = btn.querySelector<HTMLElement>('.going-count');
  if (countEl) {
    countEl.textContent = count ? String(count) : '';
    countEl.hidden = !count;
  }
}

function paintFriends(el: HTMLElement, info: GoingInfo | undefined) {
  el.innerHTML = '';
  const friends = info?.friends ?? [];
  if (!friends.length) { el.hidden = true; return; }
  el.hidden = false;
  const shown = friends.slice(0, 3);
  shown.forEach((f) => {
    const a = document.createElement('a');
    a.className = 'avatar going-face';
    a.href = `/u/?u=${encodeURIComponent(f.username)}`;
    a.title = f.display_name || f.username;
    paintAvatar(a, f.avatar_url, f.display_name || f.username, undefined);
    el.appendChild(a);
  });
  const names = shown.map((f) => f.display_name || f.username);
  const extra = friends.length - shown.length;
  const text = document.createElement('span');
  text.className = 'going-friends-text';
  text.textContent = extra > 0
    ? `${names.join(', ')} +${extra} going`
    : `${names.length === 1 ? names[0] + ' is' : names.join(', ') + ' are'} going`;
  el.appendChild(text);
}

/** Fill in every `.going-btn` / `.going-friends` under `root`. Call after
 *  any show markup lands in the DOM (page load is handled by Base.astro;
 *  re-rendered lists such as search results and the calendar day panel
 *  call it themselves). */
export async function paintGoing(root: ParentNode = document) {
  const btns = Array.from(root.querySelectorAll<HTMLElement>('.going-btn[data-show-key]'));
  const faces = Array.from(root.querySelectorAll<HTMLElement>('.going-friends[data-show-key]'));
  const keys = Array.from(new Set([...btns, ...faces].map((el) => el.dataset.showKey || '').filter(Boolean)));
  if (!keys.length) return;
  const fresh = await fetchInfo(keys);
  keys.forEach((k) => cache.set(k, fresh.get(k) ?? { going_count: 0, going_by_me: false, friends: [] }));
  btns.forEach((b) => paintButton(b, cache.get(b.dataset.showKey || '')));
  faces.forEach((f) => paintFriends(f, cache.get(f.dataset.showKey || '')));
}

let delegated = false;

/** Wires up the toggle for every current and future `.going-btn` on the page
 *  and paints current state. Called once from Base.astro. */
export function enableGoing() {
  if (delegated || !supabaseConfigured || !supabase) return;
  delegated = true;

  document.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('.going-btn') as HTMLButtonElement | null;
    if (!btn || btn.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const key = btn.dataset.showKey, slug = btn.dataset.slug, date = btn.dataset.date, artist = btn.dataset.artist;
    if (!key || !slug || !date || !artist) return;

    const { data: { session } } = await supabase!.auth.getSession();
    if (!session?.user) { location.href = '/login/'; return; }

    const going = btn.classList.contains('going');
    btn.disabled = true;
    try {
      if (going) {
        await supabase!.from('show_rsvps').delete().eq('user_id', session.user.id).eq('show_key', key);
      } else {
        await supabase!.from('show_rsvps').insert({ user_id: session.user.id, show_key: key, venue_slug: slug, show_date: date, artist });
      }
      // Re-read this one show so the count and faces stay exact, then paint
      // every copy of it on the page (the venue row and the calendar panel
      // can both be showing the same show).
      const fresh = await fetchInfo([key]);
      const info = fresh.get(key) ?? { going_count: 0, going_by_me: false, friends: [] };
      cache.set(key, info);
      document.querySelectorAll<HTMLElement>(`.going-btn[data-show-key="${CSS.escape(key)}"]`).forEach((b) => paintButton(b, info));
      document.querySelectorAll<HTMLElement>(`.going-friends[data-show-key="${CSS.escape(key)}"]`).forEach((f) => paintFriends(f, info));
    } finally {
      btn.disabled = false;
    }
  });

  paintGoing(document);
}
