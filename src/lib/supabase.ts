// Supabase client for the browser. Auth + the `profiles`/`likes` tables
// (see supabase/schema.sql) are all reached through this one client, called
// from <script> tags on the page -- never from Astro frontmatter, since
// frontmatter runs at BUILD time and has no user session to work with.
//
// PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_PUBLISHABLE_KEY come from .env (gitignored;
// copy .env.example to get started). If they're missing -- e.g. this repo
// was just cloned and .env hasn't been set up yet -- `supabase` is null and
// every feature that depends on it (login, likes, the profile page) shows a
// plain "not configured yet" state instead of throwing.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const publishableKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && publishableKey);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url, publishableKey)
  : null;
