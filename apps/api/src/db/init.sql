-- ============================================================================
--  Initial schema for the agent registry.
--
--  Run this ONCE in the Supabase SQL editor (Dashboard → SQL Editor → New
--  query → paste → Run) before starting the API for the first time.
--
--  After this, schema changes go through Drizzle:
--      npm run db:generate    -- writes a versioned .sql into src/db/migrations
--      npm run db:push        -- applies it
-- ============================================================================

create table if not exists public.agents (
  agent_id        text        primary key,
  user_id         uuid        not null references auth.users (id) on delete cascade,
  llm_id          text        not null,
  agent_name      text        not null,
  spec            jsonb       not null,
  compiled_prompt text        not null,
  created_at      timestamptz not null default now()
);

-- Every list query is "this user's agents, newest first".
create index if not exists agents_user_id_created_at_idx
  on public.agents (user_id, created_at);

-- ----------------------------------------------------------------------------
--  Row Level Security
--
--  The API connects as the `postgres` role via DATABASE_URL, which bypasses RLS
--  entirely — ownership is enforced in AgentsRepository, where every query is
--  scoped by user_id.
--
--  So why enable RLS at all? Because Supabase also exposes this table over
--  PostgREST, reachable by anyone holding the project's anon key. Enabling RLS
--  with no policies makes that path deny-by-default. Without these two lines,
--  the anon key would read every row in this table.
-- ----------------------------------------------------------------------------
alter table public.agents enable row level security;

-- Belt and braces: PostgREST should not see this table at all.
revoke all on public.agents from anon, authenticated;
