create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  mode text not null default 'build',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  mode text not null default 'build',
  content text not null default '',
  files jsonb,
  title text,
  cost integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_session_idx on public.chat_messages(session_id, id);
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
drop policy if exists chat_sessions_own on public.chat_sessions;
create policy chat_sessions_own on public.chat_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists chat_messages_own on public.chat_messages;
create policy chat_messages_own on public.chat_messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.published_sites (
  slug text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.chat_sessions(id) on delete set null,
  title text not null,
  files jsonb not null,
  domain text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.published_sites enable row level security;
drop policy if exists sites_public_read on public.published_sites;
create policy sites_public_read on public.published_sites for select using (true);
drop policy if exists sites_owner_write on public.published_sites;
create policy sites_owner_write on public.published_sites for insert with check (auth.uid() = user_id);
drop policy if exists sites_owner_update on public.published_sites;
create policy sites_owner_update on public.published_sites for update using (auth.uid() = user_id) with check (auth.uid() = user_id);