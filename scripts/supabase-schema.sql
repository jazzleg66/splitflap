-- Digital Solari — Supabase Session Persistence Schema
-- Run this in the Supabase SQL editor after creating a new Supabase project

-- Create sessions table
create table if not exists sessions (
  id           text primary key,
  pair_code    text not null unique,
  state        text not null default 'pending',
  current_rows jsonb,
  last_active  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- Index for efficient purge queries and last_active tracking
create index if not exists idx_sessions_last_active on sessions (last_active);
create index if not exists idx_sessions_state on sessions (state);

-- RLS is disabled for simplicity (no auth integration needed)
-- But in production, consider enabling RLS if you add per-user accounts

-- Optional: Auto-cleanup via pg_cron (if your Supabase plan supports it)
-- Uncomment to enable automatic deletion of sessions idle >24 hours
/*
select cron.schedule(
  'purge-old-sessions',
  '0 * * * *',  -- every hour
  $$
  delete from sessions
  where last_active < now() - interval '24 hours';
  $$
);
*/

-- Or use a simpler approach: trigger on application startup to delete old sessions
-- This is handled by sessionManager.js's purge interval instead
