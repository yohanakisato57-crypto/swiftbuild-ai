create table if not exists public.connector_credentials (
  user_id uuid not null references auth.users(id) on delete cascade,
  connector_id text not null,
  secrets jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, connector_id)
);
alter table public.connector_credentials enable row level security;
drop policy if exists cc_select on public.connector_credentials;
drop policy if exists cc_insert on public.connector_credentials;
drop policy if exists cc_update on public.connector_credentials;
drop policy if exists cc_delete on public.connector_credentials;
create policy cc_select on public.connector_credentials for select using (auth.uid() = user_id);
create policy cc_insert on public.connector_credentials for insert with check (auth.uid() = user_id);
create policy cc_update on public.connector_credentials for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy cc_delete on public.connector_credentials for delete using (auth.uid() = user_id);