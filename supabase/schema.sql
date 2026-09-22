-- The 380: user profiles + venue likes
-- Run this once in your Supabase project's SQL editor (Project > SQL Editor > New query).
-- Safe to re-run: uses "create or replace" / "if not exists" where possible.

-- ─── profiles ───────────────────────────────────────────────────────────────
-- One row per signed-up user. Created automatically by the trigger below —
-- you never insert into this table from the app.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  onboarded boolean not null default false,
  bio text,
  home_city text,
  favorite_type text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Existing projects created before these columns existed: this adds them
-- without disturbing anything else. Safe to re-run.
alter table public.profiles add column if not exists onboarded boolean not null default false;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists home_city text;
alter table public.profiles add column if not exists favorite_type text;
alter table public.profiles add column if not exists avatar_url text;

alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Auto-create a profile row whenever someone signs up.
-- Default display name = the part of their email before the @; they can
-- change it on their profile page any time.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── likes ──────────────────────────────────────────────────────────────────
-- One row per (user, venue) like. venue_slug matches the slug in the site's
-- venues-iowa-city.json / venues-cedar-rapids.json -- venues themselves are
-- NOT stored in this database, only the like relationship.
create table if not exists public.likes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  venue_slug text not null,
  created_at timestamptz not null default now(),
  unique (user_id, venue_slug)
);

create index if not exists likes_venue_slug_idx on public.likes (venue_slug);

alter table public.likes enable row level security;

drop policy if exists "Users can view their own likes" on public.likes;
create policy "Users can view their own likes"
  on public.likes for select
  using (auth.uid() = user_id);

drop policy if exists "Users can like venues" on public.likes;
create policy "Users can like venues"
  on public.likes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can unlike venues" on public.likes;
create policy "Users can unlike venues"
  on public.likes for delete
  using (auth.uid() = user_id);

-- ─── public like counts ─────────────────────────────────────────────────────
-- The "likes" table itself is private (RLS above only lets you see your own
-- rows) so a venue page can't just SELECT count(*) from it. These two
-- security-definer functions run with elevated rights to compute a public
-- aggregate WITHOUT exposing which specific users liked what.

-- Count + "did I like this" for a single venue (what the venue detail page calls).
create or replace function public.venue_like_info(p_slug text)
returns table (like_count bigint, liked_by_me boolean)
language sql
security definer
set search_path = public
stable
as $$
  select
    (select count(*) from public.likes where venue_slug = p_slug) as like_count,
    exists(
      select 1 from public.likes
      where venue_slug = p_slug and user_id = auth.uid()
    ) as liked_by_me;
$$;

grant execute on function public.venue_like_info(text) to anon, authenticated;

-- Counts for every venue at once (handy for list/grid pages later).
create or replace function public.venue_like_counts()
returns table (venue_slug text, like_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select l.venue_slug, count(*) as like_count
  from public.likes l
  group by l.venue_slug;
$$;

grant execute on function public.venue_like_counts() to anon, authenticated;


-- ─── avatars (storage) ──────────────────────────────────────────────────────
-- A public bucket, one image per user: the object's name IS their user id
-- (no folders, no file extension needed -- content-type is stored separately
-- by Storage), so a re-upload with upsert:true just replaces it in place.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "Avatar images are publicly accessible" on storage.objects;
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text);

drop policy if exists "Users can replace their own avatar" on storage.objects;
create policy "Users can replace their own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and name = (select auth.uid())::text);

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (bucket_id = 'avatars' and name = (select auth.uid())::text);


-- ─── profile photo gallery ──────────────────────────────────────────────────
-- Multiple photos per user, each its own row + storage object (unlike the
-- single-file avatar bucket above).
create table if not exists public.profile_photos (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  url text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);
create index if not exists profile_photos_user_id_idx on public.profile_photos (user_id);
alter table public.profile_photos enable row level security;

drop policy if exists "Users can view their own gallery photos" on public.profile_photos;
create policy "Users can view their own gallery photos"
  on public.profile_photos for select
  using (auth.uid() = user_id);

drop policy if exists "Users can add their own gallery photos" on public.profile_photos;
create policy "Users can add their own gallery photos"
  on public.profile_photos for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own gallery photos" on public.profile_photos;
create policy "Users can delete their own gallery photos"
  on public.profile_photos for delete
  using (auth.uid() = user_id);

-- Storage: one folder per user (<user_id>/<random>.<ext>), multiple files allowed.
insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "Profile gallery photos are publicly accessible" on storage.objects;
create policy "Profile gallery photos are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'profile-photos');

drop policy if exists "Users can upload to their own gallery folder" on storage.objects;
create policy "Users can upload to their own gallery folder"
  on storage.objects for insert
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users can delete from their own gallery folder" on storage.objects;
create policy "Users can delete from their own gallery folder"
  on storage.objects for delete
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ─── public profile pages (username) ───────────────────────────────────────
-- A username is how someone else finds your public page, at /u/?u=<username>.
-- Optional -- existing users have none until they set one on /profile/.
alter table public.profiles add column if not exists username text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_key') then
    alter table public.profiles add constraint profiles_username_key unique (username);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_format') then
    alter table public.profiles add constraint profiles_username_format
      check (username is null or username ~ '^[a-z0-9][a-z0-9-]{1,18}[a-z0-9]$');
  end if;
end $$;

-- ─── friend requests ────────────────────────────────────────────────────────
-- One row per request. "Declined" isn't stored as a status -- declining just
-- deletes the row, same as unsending or unfriending -- so someone can always
-- try again later without a stale row blocking a fresh request.
create table if not exists public.friend_requests (
  id bigint generated always as identity primary key,
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
create index if not exists friend_requests_addressee_idx on public.friend_requests (addressee_id, status);
create index if not exists friend_requests_requester_idx on public.friend_requests (requester_id, status);

alter table public.friend_requests enable row level security;

drop policy if exists "Either side can view a friend request" on public.friend_requests;
create policy "Either side can view a friend request"
  on public.friend_requests for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "Users can send friend requests" on public.friend_requests;
create policy "Users can send friend requests"
  on public.friend_requests for insert
  with check (auth.uid() = requester_id);

drop policy if exists "Addressee can accept a request" on public.friend_requests;
create policy "Addressee can accept a request"
  on public.friend_requests for update
  using (auth.uid() = addressee_id)
  with check (auth.uid() = addressee_id);

drop policy if exists "Either side can remove a friend request" on public.friend_requests;
create policy "Either side can remove a friend request"
  on public.friend_requests for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Your accepted friends, with the OTHER person's public info attached -- for
-- the "Friends" list on /profile/. Security-definer so it can resolve their
-- name/avatar (their profiles row isn't otherwise visible to you).
create or replace function public.my_friends()
returns table (id uuid, username text, display_name text, avatar_url text)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.username, p.display_name, p.avatar_url
  from public.friend_requests fr
  join public.profiles p
    on p.id = (case when fr.requester_id = auth.uid() then fr.addressee_id else fr.requester_id end)
  where fr.status = 'accepted' and (fr.requester_id = auth.uid() or fr.addressee_id = auth.uid());
$$;

revoke execute on function public.my_friends() from public;
grant execute on function public.my_friends() to authenticated;

-- Incoming pending requests, with the requester's public info attached --
-- for the "Friend requests" inbox on /profile/. Reads auth.uid() itself, so
-- there's no parameter and no way to ask for anyone else's inbox.
create or replace function public.pending_friend_requests()
returns table (request_id bigint, requester_id uuid, username text, display_name text, avatar_url text, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select fr.id, p.id, p.username, p.display_name, p.avatar_url, fr.created_at
  from public.friend_requests fr
  join public.profiles p on p.id = fr.requester_id
  where fr.addressee_id = auth.uid() and fr.status = 'pending'
  order by fr.created_at desc;
$$;

revoke execute on function public.pending_friend_requests() from public;
grant execute on function public.pending_friend_requests() to authenticated;

-- ─── posts ──────────────────────────────────────────────────────────────────
-- Short text posts on someone's own public page. Optionally tagged to a
-- venue (matches likes.venue_slug -- venues live in JSON, not the DB).
-- Private-by-default RLS like likes/profile_photos above; posts are exposed
-- publicly only through public_profile() below, same pattern as those.
create table if not exists public.posts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  venue_slug text,
  created_at timestamptz not null default now()
);
create index if not exists posts_user_id_idx on public.posts (user_id, created_at desc);

alter table public.posts enable row level security;

drop policy if exists "Users can view their own posts" on public.posts;
create policy "Users can view their own posts"
  on public.posts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can write their own posts" on public.posts;
create policy "Users can write their own posts"
  on public.posts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own posts" on public.posts;
create policy "Users can delete their own posts"
  on public.posts for delete
  using (auth.uid() = user_id);

-- ─── public profile lookup ──────────────────────────────────────────────────
-- The one function the public page (/u/?u=<username>) calls. Returns a safe,
-- narrow, READ-ONLY slice of someone's profile plus their liked venues,
-- gallery photos and posts -- all of which are otherwise private-by-default
-- (see the RLS above on profiles/likes/profile_photos/posts). Nothing here
-- loosens that RLS; this just exposes exactly these columns, and only for
-- rows that have chosen a username. Each post's "comments" key is filled in
-- below, once the comments table exists.
create or replace function public.public_profile(p_username text)
returns table (
  id uuid,
  username text,
  display_name text,
  bio text,
  home_city text,
  favorite_type text,
  avatar_url text,
  liked_venues text[],
  gallery_urls text[],
  posts jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id, p.username, p.display_name, p.bio, p.home_city, p.favorite_type, p.avatar_url,
    coalesce((
      select array_agg(l.venue_slug order by l.created_at desc)
      from public.likes l where l.user_id = p.id
    ), '{}'::text[]),
    coalesce((
      select array_agg(g.url order by g.created_at asc)
      from public.profile_photos g where g.user_id = p.id
    ), '{}'::text[]),
    coalesce((
      select jsonb_agg(jsonb_build_object('id', po.id, 'body', po.body, 'venue_slug', po.venue_slug, 'created_at', po.created_at) order by po.created_at desc)
      from public.posts po where po.user_id = p.id
    ), '[]'::jsonb)
  from public.profiles p
  where p.username = lower(p_username);
$$;

grant execute on function public.public_profile(text) to anon, authenticated;

-- ─── comments (on venues + on posts) ────────────────────────────────────────
-- One row per comment. Attaches to EITHER a post (post_id) or a venue
-- (venue_slug, matching likes.venue_slug/posts.venue_slug -- venues live in
-- JSON, not the DB) -- never both, never neither. Private-by-default RLS
-- like posts/likes above; comments are exposed publicly only through
-- venue_comments() below and through public_profile()'s nested posts.comments,
-- same pattern as posts/likes/profile_photos.
create table if not exists public.comments (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  post_id bigint references public.posts (id) on delete cascade,
  venue_slug text,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  check (
    (post_id is not null and venue_slug is null) or
    (post_id is null and venue_slug is not null)
  )
);
create index if not exists comments_post_id_idx on public.comments (post_id, created_at);
create index if not exists comments_venue_slug_idx on public.comments (venue_slug, created_at);

-- Optional: tag one friend in a comment. Friends-only is enforced below at
-- the database level (same pattern as the messages insert policy further
-- down) -- not just hidden in the UI.
alter table public.comments add column if not exists tagged_user_id uuid references auth.users (id) on delete set null;

alter table public.comments enable row level security;

drop policy if exists "Users can view their own comments" on public.comments;
create policy "Users can view their own comments"
  on public.comments for select
  using (auth.uid() = user_id);

drop policy if exists "Users can write their own comments" on public.comments;
create policy "Users can write their own comments"
  on public.comments for insert
  with check (
    auth.uid() = user_id
    and (
      tagged_user_id is null
      or exists (
        select 1 from public.friend_requests fr
        where fr.status = 'accepted'
          and (
            (fr.requester_id = user_id and fr.addressee_id = tagged_user_id) or
            (fr.requester_id = tagged_user_id and fr.addressee_id = user_id)
          )
      )
    )
  );

drop policy if exists "Users can delete their own comments" on public.comments;
create policy "Users can delete their own comments"
  on public.comments for delete
  using (auth.uid() = user_id);

-- Comments on a venue page, with the commenter's public info attached --
-- security-definer so it can resolve their name/avatar (their profiles row
-- isn't otherwise visible to anyone but them).
create or replace function public.venue_comments(p_venue_slug text)
returns table (
  id bigint, user_id uuid, username text, display_name text, avatar_url text,
  body text, created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, c.user_id, p.username, p.display_name, p.avatar_url, c.body, c.created_at
  from public.comments c
  join public.profiles p on p.id = c.user_id
  where c.venue_slug = p_venue_slug
  order by c.created_at asc;
$$;

grant execute on function public.venue_comments(text) to anon, authenticated;

-- public_profile() is redefined here (same signature, same rows) purely so
-- each post's jsonb now carries a nested "comments" array -- commenter info
-- and body -- now that the comments table above exists to pull it from.
create or replace function public.public_profile(p_username text)
returns table (
  id uuid,
  username text,
  display_name text,
  bio text,
  home_city text,
  favorite_type text,
  avatar_url text,
  liked_venues text[],
  gallery_urls text[],
  posts jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id, p.username, p.display_name, p.bio, p.home_city, p.favorite_type, p.avatar_url,
    coalesce((
      select array_agg(l.venue_slug order by l.created_at desc)
      from public.likes l where l.user_id = p.id
    ), '{}'::text[]),
    coalesce((
      select array_agg(g.url order by g.created_at asc)
      from public.profile_photos g where g.user_id = p.id
    ), '{}'::text[]),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', po.id, 'body', po.body, 'venue_slug', po.venue_slug, 'created_at', po.created_at,
        'comments', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', c.id, 'user_id', c.user_id, 'username', cp.username,
            'display_name', cp.display_name, 'avatar_url', cp.avatar_url,
            'body', c.body, 'created_at', c.created_at
          ) order by c.created_at asc)
          from public.comments c
          join public.profiles cp on cp.id = c.user_id
          where c.post_id = po.id
        ), '[]'::jsonb)
      ) order by po.created_at desc)
      from public.posts po where po.user_id = p.id
    ), '[]'::jsonb)
  from public.profiles p
  where p.username = lower(p_username);
$$;

grant execute on function public.public_profile(text) to anon, authenticated;

-- public_profile() is redefined once more here, adding a venue_comments
-- array alongside posts: the comments THIS user has left on venue pages,
-- so their own profile feed can show those mixed in with their wall posts
-- (a venue comment is also a feed item on your own page, not just something
-- that lives on the venue's page). Changing the returned columns means
-- dropping the function first -- Postgres won't let CREATE OR REPLACE
-- change what a function returns in place.
drop function if exists public.public_profile(text);

create or replace function public.public_profile(p_username text)
returns table (
  id uuid,
  username text,
  display_name text,
  bio text,
  home_city text,
  favorite_type text,
  avatar_url text,
  liked_venues text[],
  gallery_urls text[],
  posts jsonb,
  venue_comments jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id, p.username, p.display_name, p.bio, p.home_city, p.favorite_type, p.avatar_url,
    coalesce((
      select array_agg(l.venue_slug order by l.created_at desc)
      from public.likes l where l.user_id = p.id
    ), '{}'::text[]),
    coalesce((
      select array_agg(g.url order by g.created_at asc)
      from public.profile_photos g where g.user_id = p.id
    ), '{}'::text[]),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', po.id, 'body', po.body, 'venue_slug', po.venue_slug, 'created_at', po.created_at,
        'comments', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', c.id, 'user_id', c.user_id, 'username', cp.username,
            'display_name', cp.display_name, 'avatar_url', cp.avatar_url,
            'body', c.body, 'created_at', c.created_at,
            'tagged_user_id', c.tagged_user_id, 'tagged_username', tp.username, 'tagged_display_name', tp.display_name
          ) order by c.created_at asc)
          from public.comments c
          join public.profiles cp on cp.id = c.user_id
          left join public.profiles tp on tp.id = c.tagged_user_id
          where c.post_id = po.id
        ), '[]'::jsonb)
      ) order by po.created_at desc)
      from public.posts po where po.user_id = p.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'venue_slug', c.venue_slug, 'body', c.body, 'created_at', c.created_at,
        'tagged_user_id', c.tagged_user_id, 'tagged_username', tp.username, 'tagged_display_name', tp.display_name
      ) order by c.created_at desc)
      from public.comments c
      left join public.profiles tp on tp.id = c.tagged_user_id
      where c.user_id = p.id and c.venue_slug is not null
    ), '[]'::jsonb)
  from public.profiles p
  where p.username = lower(p_username);
$$;

grant execute on function public.public_profile(text) to anon, authenticated;

-- public_profile() (above) resolves comment tags through venue_comments()
-- and its own nested posts.comments; venue_comments() is redefined here so
-- venue PAGES (not just profile feeds) can show a comment's tagged friend
-- too. Adding those tagged_* columns means dropping the function first --
-- Postgres won't let CREATE OR REPLACE change what a function returns.
drop function if exists public.venue_comments(text);

create or replace function public.venue_comments(p_venue_slug text)
returns table (
  id bigint, user_id uuid, username text, display_name text, avatar_url text,
  body text, created_at timestamptz,
  tagged_user_id uuid, tagged_username text, tagged_display_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    c.id, c.user_id, p.username, p.display_name, p.avatar_url, c.body, c.created_at,
    c.tagged_user_id, tp.username, tp.display_name
  from public.comments c
  join public.profiles p on p.id = c.user_id
  left join public.profiles tp on tp.id = c.tagged_user_id
  where c.venue_slug = p_venue_slug
  order by c.created_at asc;
$$;

grant execute on function public.venue_comments(text) to anon, authenticated;

-- ─── messages (direct messages between friends) ────────────────────────────
-- One row per message. Text, a photo, or both -- never neither. Friends-only
-- is enforced here at the database level (not just in the UI): the insert
-- policy below checks for an accepted friend_requests row between the two
-- people, so nobody can DM someone they aren't friends with even by calling
-- the API directly.
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  body text check (char_length(body) <= 2000),
  photo_url text,
  photo_path text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id),
  check (body is not null or photo_url is not null)
);
create index if not exists messages_pair_idx on public.messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at);
create index if not exists messages_recipient_unread_idx on public.messages (recipient_id, read_at);

alter table public.messages enable row level security;

drop policy if exists "Participants can view their messages" on public.messages;
create policy "Participants can view their messages"
  on public.messages for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "Users can message their friends" on public.messages;
create policy "Users can message their friends"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.friend_requests fr
      where fr.status = 'accepted'
        and (
          (fr.requester_id = sender_id and fr.addressee_id = recipient_id) or
          (fr.requester_id = recipient_id and fr.addressee_id = sender_id)
        )
    )
  );

drop policy if exists "Recipient can mark a message read" on public.messages;
create policy "Recipient can mark a message read"
  on public.messages for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

drop policy if exists "Sender can delete their own message" on public.messages;
create policy "Sender can delete their own message"
  on public.messages for delete
  using (auth.uid() = sender_id);

-- Realtime: lets the conversation page get new messages pushed to it live
-- instead of needing a refresh.
-- Wrapped so this block can be re-run safely: ALTER PUBLICATION ... ADD TABLE
-- has no IF NOT EXISTS, so re-running the raw statement errors (42710) once
-- messages is already in the publication. Catch that one case and move on.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then
    null;
end $$;

-- Your conversations, newest first, one row per friend you've messaged --
-- with their public info, the last message, and how many of their messages
-- to you are still unread. Security-definer so it can resolve the other
-- person's name/avatar; reads auth.uid() itself, so there's no parameter and
-- no way to ask for anyone else's inbox.
--
-- Returns last_photo_path (not last_photo_url): message-photos is a private
-- bucket, so the only durable reference is the storage path -- the inbox
-- page uses this just to show "Photo" in the preview line, and the thread
-- page creates a fresh signed URL per photo from its own photo_path when it
-- actually needs to display one.
--
-- drop first in case an earlier run of this file already created the
-- last_photo_url version -- Postgres won't let CREATE OR REPLACE change
-- what a function returns in place.
drop function if exists public.my_conversations();

create or replace function public.my_conversations()
returns table (
  friend_id uuid, username text, display_name text, avatar_url text,
  last_body text, last_photo_path text, last_created_at timestamptz,
  last_sender_id uuid, unread_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with mine as (
    select
      case when sender_id = auth.uid() then recipient_id else sender_id end as friend_id,
      body, photo_path, created_at, sender_id, read_at
    from public.messages
    where sender_id = auth.uid() or recipient_id = auth.uid()
  ),
  ranked as (
    select mine.*, row_number() over (partition by friend_id order by created_at desc) as rn
    from mine
  )
  select
    r.friend_id, p.username, p.display_name, p.avatar_url,
    r.body, r.photo_path, r.created_at, r.sender_id,
    (select count(*) from mine m2 where m2.friend_id = r.friend_id and m2.sender_id <> auth.uid() and m2.read_at is null)
  from ranked r
  join public.profiles p on p.id = r.friend_id
  where r.rn = 1
  order by r.created_at desc;
$$;

revoke execute on function public.my_conversations() from public;
grant execute on function public.my_conversations() to authenticated;

-- Storage: message photos, private (unlike the public avatars/profile-photos
-- buckets -- a DM photo should only ever be reachable by the two people in
-- the conversation). Path is <sender_id>/<recipient_id>/<random>.<ext>, so
-- the policies below can tell participants apart from the path alone with
-- no join back to the messages table.
insert into storage.buckets (id, name, public)
values ('message-photos', 'message-photos', false)
on conflict (id) do update set public = false;

drop policy if exists "Participants can view message photos" on storage.objects;
create policy "Participants can view message photos"
  on storage.objects for select
  using (
    bucket_id = 'message-photos' and (
      (storage.foldername(name))[1] = (select auth.uid())::text or
      (storage.foldername(name))[2] = (select auth.uid())::text
    )
  );

drop policy if exists "Users can upload message photos to their own outgoing folder" on storage.objects;
create policy "Users can upload message photos to their own outgoing folder"
  on storage.objects for insert
  with check (
    bucket_id = 'message-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Sender can delete their own message photos" on storage.objects;
create policy "Sender can delete their own message photos"
  on storage.objects for delete
  using (
    bucket_id = 'message-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
-- ─── search_profiles ─────────────────────────────────────────────────────
-- Lets you find someone to friend by typing their name or handle, instead
-- of needing a link to their public page first. Security-definer, like
-- my_friends()/pending_friend_requests() above, since profiles and
-- friend_requests are both locked to your own rows by RLS -- and it only
-- ever returns the same public-safe fields those do (never email). Also
-- folds in your current relationship to each match (none / pending in
-- either direction / accepted) plus that request's id, so the search
-- results can offer the right action (Add / Cancel / Accept+Decline /
-- Friends) without a second round trip per row.
create or replace function public.search_profiles(p_query text)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  relationship text,
  request_id bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    case
      when fr.status = 'accepted' then 'accepted'
      when fr.status = 'pending' and fr.requester_id = auth.uid() then 'pending_sent'
      when fr.status = 'pending' then 'pending_received'
      else 'none'
    end as relationship,
    fr.id as request_id
  from public.profiles p
  left join public.friend_requests fr
    on (fr.requester_id = auth.uid() and fr.addressee_id = p.id)
    or (fr.requester_id = p.id and fr.addressee_id = auth.uid())
  where p.username is not null
    and p.id <> auth.uid()
    and length(trim(p_query)) >= 2
    and (p.username ilike '%' || p_query || '%' or p.display_name ilike '%' || p_query || '%')
  order by (p.username ilike p_query || '%') desc, p.username asc
  limit 10;
$$;

revoke execute on function public.search_profiles(text) from public;
grant execute on function public.search_profiles(text) to authenticated;

-- ─── push subscriptions (Web Push, for DM notifications) ───────────────────
-- One row per device/browser a signed-in user has opted into notifications
-- on. A person can have several rows (phone + laptop, say) -- each is its
-- own independent push endpoint. Row-level security means everyone can only
-- see and manage their own subscriptions from the client; the Edge Function
-- that actually sends a push (see supabase/functions/send-message-push)
-- runs with the service role key, which bypasses RLS, so it can still look
-- up *any* recipient's subscriptions when a new message comes in.
--
-- This table is all this section sets up. The "when a message arrives, call
-- the Edge Function" wiring is a Database Webhook created in the Supabase
-- dashboard rather than more SQL -- see the PWA setup guide.
create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (endpoint)
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can view their own push subscriptions" on public.push_subscriptions;
create policy "Users can view their own push subscriptions"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can add their own push subscriptions" on public.push_subscriptions;
create policy "Users can add their own push subscriptions"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own push subscriptions" on public.push_subscriptions;
create policy "Users can remove their own push subscriptions"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);
