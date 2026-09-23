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
  retell_agent_id text        not null,
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
--  retell_agent_id, added when the project moved Retell accounts.
--
--  agent_id used to be Retell's id as well. It is now ours alone, so share
--  links survive an account move, and this column carries whatever Retell
--  calls the agent today. For a database created before this change the three
--  statements below add it and seed it from agent_id, which is correct: every
--  row that predates the column was created when the two were the same value.
--
--  All three are no-ops on a fresh database, where the column is already in
--  the create table above.
-- ----------------------------------------------------------------------------
alter table public.agents add column if not exists retell_agent_id text;
update public.agents set retell_agent_id = agent_id where retell_agent_id is null;
alter table public.agents alter column retell_agent_id set not null;

-- Two rows pointing at one Retell agent would mean a migration ran twice.
create unique index if not exists agents_retell_agent_id_key
  on public.agents (retell_agent_id);

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
