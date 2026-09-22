// src/lib/likes.ts
//
// Shared "like a venue" behavior for venue CARDS across listing pages
// (search results, drink/eat/events grids, homepage picks, neighborhoods,
// game day, etc). The venue detail page has its own richer version of
// this already (it shows a live count via the venue_like_info RPC) --
// this is the lighter, icon-only version made to drop into any card
// without per-page wiring: render a
//   <button class="card-like-btn" data-slug="...">
//     <span class="like-icon" aria-hidden="true">♡</span>
//   </button>
// anywhere and this file takes care of the rest via one delegated click
// listener, set up once from Base.astro.

import { supabase, supabaseConfigured } from './supabase';

let myLikes: Set<string> | null = null;
let loadingLikes: Promise<Set<string>> | null = null;

async function getMyLikes(): Promise<Set<string>> {
  if (myLikes) return myLikes;
  if (!loadingLikes) {
    loadingLikes = (async () => {
      if (!supabaseConfigured || !supabase) return new Set<string>();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return new Set<string>();
      const { data } = await supabase.from('likes').select('venue_slug').eq('user_id', session.user.id);
      return new Set((data || []).map((r: { venue_slug: string }) => r.venue_slug));
    })();
    loadingLikes.then((set) => { myLikes = set; });
  }
  return loadingLikes;
}

function paint(btn: HTMLElement, liked: boolean) {
  btn.classList.toggle('liked', liked);
  btn.setAttribute('aria-pressed', String(liked));
  const icon = btn.querySelector('.like-icon');
  if (icon) icon.textContent = liked ? '♥' : '♡';
}

/** Call after any markup containing `.card-like-btn[data-slug]` lands in
 *  the DOM -- once on initial page load (Base.astro does this for you),
 *  and again after re-rendering any cards client-side (search.astro's
 *  search-as-you-type results). Safe to call as often as you like. */
export async function paintLikeButtons(root: ParentNode = document) {
  const buttons = root.querySelectorAll<HTMLElement>('.card-like-btn[data-slug]');
  if (!buttons.length) return;
  const likes = await getMyLikes();
  buttons.forEach((btn) => paint(btn, likes.has(btn.dataset.slug || '')));
}

let delegated = false;

/** Wires up click-to-like for every current and future `.card-like-btn`
 *  on the page via one delegated listener, and paints current state.
 *  Called once from Base.astro; safe to call more than once. */
export function enableCardLikes() {
  if (delegated || !supabaseConfigured || !supabase) return;
  delegated = true;

  document.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('.card-like-btn') as HTMLButtonElement | null;
    if (!btn || btn.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const slug = btn.dataset.slug;
    if (!slug) return;

    const { data: { session } } = await supabase!.auth.getSession();
    if (!session?.user) { location.href = '/login/'; return; }

    const likes = await getMyLikes();
    const liked = likes.has(slug);
    btn.disabled = true;
    try {
      if (liked) {
        await supabase!.from('likes').delete().eq('user_id', session.user.id).eq('venue_slug', slug);
        likes.delete(slug);
      } else {
        await supabase!.from('likes').insert({ user_id: session.user.id, venue_slug: slug });
        likes.add(slug);
      }
      paint(btn, !liked);
    } finally {
      btn.disabled = false;
    }
  });

  paintLikeButtons(document);
}
