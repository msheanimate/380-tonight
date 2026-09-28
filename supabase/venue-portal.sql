-- ─── Venue portal ───────────────────────────────────────────────────────────
-- Site admins (you), venue managers (bar owners you approve), and the content
-- owners edit from /manage/: feed posts, menu, happy hours & specials, events,
-- gallery and party photos. Everything here is publicly readable (it's shown on
-- the venue pages); only an approved manager of that venue -- or an admin --
-- can write it. Run this once in Supabase's SQL Editor. Safe to re-run.

-- Admins. Add yourself after running this file:
--   insert into public.site_admins (user_id)
--   select id from auth.users where email = 'YOUR-LOGIN-EMAIL';
create table if not exists public.site_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.site_admins enable row level security;
drop policy if exists "Admins can see themselves" on public.site_admins;
create policy "Admins can see themselves" on public.site_admins for select using (auth.uid() = user_id);

create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.site_admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- Who manages which venue. An owner asks (status 'pending'); an admin approves.
create table if not exists public.venue_managers (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  venue_slug text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  note text check (note is null or char_length(note) <= 500),   -- "I'm the GM, call 319-..."
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (user_id, venue_slug)
);
alter table public.venue_managers enable row level security;
drop policy if exists "Managers see their own requests" on public.venue_managers;
create policy "Managers see their own requests" on public.venue_managers for select
  using (auth.uid() = user_id or public.is_admin());
drop policy if exists "Members can ask to manage a venue" on public.venue_managers;
create policy "Members can ask to manage a venue" on public.venue_managers for insert
  with check ((auth.uid() = user_id and status = 'pending') or public.is_admin());
drop policy if exists "Admins decide requests" on public.venue_managers;
create policy "Admins decide requests" on public.venue_managers for update
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Withdraw or remove" on public.venue_managers;
create policy "Withdraw or remove" on public.venue_managers for delete
  using (auth.uid() = user_id or public.is_admin());

create or replace function public.manages_venue(p_slug text)
returns boolean language sql security definer set search_path = public stable as $$
  select public.is_admin() or exists (
    select 1 from public.venue_managers
    where user_id = auth.uid() and venue_slug = p_slug and status = 'approved'
  );
$$;
grant execute on function public.manages_venue(text) to anon, authenticated;

-- Every request with who asked (name, username, email) -- admins only.
create or replace function public.admin_venue_managers()
returns table (id bigint, user_id uuid, venue_slug text, status text, note text, created_at timestamptz,
               decided_at timestamptz, username text, display_name text, avatar_url text, email text)
language sql security definer set search_path = public stable as $$
  select m.id, m.user_id, m.venue_slug, m.status, m.note, m.created_at, m.decided_at,
         p.username, p.display_name, p.avatar_url, u.email::text
  from public.venue_managers m
  left join public.profiles p on p.id = m.user_id
  left join auth.users u on u.id = m.user_id
  where public.is_admin()
  order by (m.status = 'pending') desc, m.created_at desc;
$$;
revoke execute on function public.admin_venue_managers() from public;
grant execute on function public.admin_venue_managers() to authenticated;

-- Site-wide counts for the admin dashboard (profiles and RSVPs are private per user).
create or replace function public.admin_stats()
returns table (members bigint, rsvps bigint, likes bigint)
language sql security definer set search_path = public stable as $$
  select (select count(*) from public.profiles), (select count(*) from public.show_rsvps), (select count(*) from public.likes)
  where public.is_admin();
$$;
revoke execute on function public.admin_stats() from public;
grant execute on function public.admin_stats() to authenticated;

-- One row per venue: the details an owner keeps current. Null = use the site's own listing.
create table if not exists public.venue_content (
  venue_slug text primary key,
  blurb text check (blurb is null or char_length(blurb) <= 600),
  hours_note text check (hours_note is null or char_length(hours_note) <= 200),
  phone text check (phone is null or char_length(phone) <= 40),
  website text,
  menu_url text,
  menu_text text check (menu_text is null or char_length(menu_text) <= 8000),
  happy_hours jsonb,     -- [{days:[1..5], start:"15:00", end:"18:00", deal:"$3 wells"}]
  specials jsonb,        -- [{day:0..6, food:[..], drinks:[..], event:".."}]
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.venue_content enable row level security;
drop policy if exists "Venue content is public" on public.venue_content;
create policy "Venue content is public" on public.venue_content for select using (true);
drop policy if exists "Managers add venue content" on public.venue_content;
create policy "Managers add venue content" on public.venue_content for insert with check (public.manages_venue(venue_slug));
drop policy if exists "Managers edit venue content" on public.venue_content;
create policy "Managers edit venue content" on public.venue_content for update
  using (public.manages_venue(venue_slug)) with check (public.manages_venue(venue_slug));

-- Events a venue posts itself (shows, trivia, watch parties...).
create table if not exists public.venue_events (
  id bigint generated always as identity primary key,
  venue_slug text not null,
  title text not null check (char_length(title) between 1 and 140),
  event_date date not null,
  start_time text check (start_time is null or char_length(start_time) <= 20),
  price text check (price is null or char_length(price) <= 60),
  category text not null default 'music' check (category in ('music', 'nightlife', 'game-day', 'arts', 'festival', 'food', 'other')),
  blurb text check (blurb is null or char_length(blurb) <= 600),
  ticket_url text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists venue_events_slug_date_idx on public.venue_events (venue_slug, event_date);
create index if not exists venue_events_date_idx on public.venue_events (event_date);
alter table public.venue_events enable row level security;
drop policy if exists "Venue events are public" on public.venue_events;
create policy "Venue events are public" on public.venue_events for select using (true);
drop policy if exists "Managers add events" on public.venue_events;
create policy "Managers add events" on public.venue_events for insert with check (public.manages_venue(venue_slug));
drop policy if exists "Managers edit events" on public.venue_events;
create policy "Managers edit events" on public.venue_events for update
  using (public.manages_venue(venue_slug)) with check (public.manages_venue(venue_slug));
drop policy if exists "Managers delete events" on public.venue_events;
create policy "Managers delete events" on public.venue_events for delete using (public.manages_venue(venue_slug));

-- The venue's own feed ("Trivia's moved to 8 tonight").
create table if not exists public.venue_posts (
  id bigint generated always as identity primary key,
  venue_slug text not null,
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (char_length(body) between 1 and 1000),
  image_url text,
  image_path text,
  created_at timestamptz not null default now()
);
create index if not exists venue_posts_slug_idx on public.venue_posts (venue_slug, created_at desc);
alter table public.venue_posts enable row level security;
drop policy if exists "Venue posts are public" on public.venue_posts;
create policy "Venue posts are public" on public.venue_posts for select using (true);
drop policy if exists "Managers post" on public.venue_posts;
create policy "Managers post" on public.venue_posts for insert
  with check (public.manages_venue(venue_slug) and author_id = auth.uid());
drop policy if exists "Managers delete posts" on public.venue_posts;
create policy "Managers delete posts" on public.venue_posts for delete using (public.manages_venue(venue_slug));

-- Gallery and party photos.
create table if not exists public.venue_photos (
  id bigint generated always as identity primary key,
  venue_slug text not null,
  kind text not null default 'gallery' check (kind in ('gallery', 'party', 'menu')),
  storage_path text not null,
  url text not null,
  caption text check (caption is null or char_length(caption) <= 200),
  taken_on date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists venue_photos_slug_idx on public.venue_photos (venue_slug, kind, created_at desc);
alter table public.venue_photos enable row level security;
drop policy if exists "Venue photos are public" on public.venue_photos;
create policy "Venue photos are public" on public.venue_photos for select using (true);
drop policy if exists "Managers add photos" on public.venue_photos;
create policy "Managers add photos" on public.venue_photos for insert with check (public.manages_venue(venue_slug));
drop policy if exists "Managers edit photos" on public.venue_photos;
create policy "Managers edit photos" on public.venue_photos for update
  using (public.manages_venue(venue_slug)) with check (public.manages_venue(venue_slug));
drop policy if exists "Managers delete photos" on public.venue_photos;
create policy "Managers delete photos" on public.venue_photos for delete using (public.manages_venue(venue_slug));

-- Storage: one public bucket, a folder per venue ("gabes/1727...-photo.jpg").
insert into storage.buckets (id, name, public)
values ('venue-media', 'venue-media', true)
on conflict (id) do nothing;
drop policy if exists "Venue media is public" on storage.objects;
create policy "Venue media is public" on storage.objects for select using (bucket_id = 'venue-media');
drop policy if exists "Managers upload venue media" on storage.objects;
create policy "Managers upload venue media" on storage.objects for insert
  with check (bucket_id = 'venue-media' and public.manages_venue((storage.foldername(name))[1]));
drop policy if exists "Managers delete venue media" on storage.objects;
create policy "Managers delete venue media" on storage.objects for delete
  using (bucket_id = 'venue-media' and public.manages_venue((storage.foldername(name))[1]));

notify pgrst, 'reload schema';
