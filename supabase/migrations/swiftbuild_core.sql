create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default 'Builder',
  provider text not null default 'email',
  credits integer not null default 0 check (credits >= 0),
  created_at timestamptz not null default now()
);
create table if not exists public.credit_ledger (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  reason text not null,
  balance_after integer not null,
  created_at timestamptz not null default now()
);
create table if not exists public.projects (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  prompt text not null default '',
  mode text not null default 'build',
  files jsonb not null default '[]',
  cost integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.orders (
  id bigserial primary key,
  reference text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_id integer not null,
  credits integer not null,
  amount numeric not null,
  currency text not null,
  tracking_id text,
  status text not null default 'pending',
  credited boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.kv (key text primary key, value text not null);

alter table public.profiles enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.projects enable row level security;
alter table public.orders enable row level security;
alter table public.kv enable row level security;

drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles for select using (auth.uid() = id);
drop policy if exists "own ledger read" on public.credit_ledger;
create policy "own ledger read" on public.credit_ledger for select using (auth.uid() = user_id);
drop policy if exists "own projects read" on public.projects;
create policy "own projects read" on public.projects for select using (auth.uid() = user_id);
drop policy if exists "own projects insert" on public.projects;
create policy "own projects insert" on public.projects for insert with check (auth.uid() = user_id);
drop policy if exists "own orders read" on public.orders;
create policy "own orders read" on public.orders for select using (auth.uid() = user_id);

create or replace function public.adjust_credits(p_user uuid, p_delta integer, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare bal integer;
begin
  update public.profiles set credits = credits + p_delta
    where id = p_user and credits + p_delta >= 0 returning credits into bal;
  if bal is null then return null; end if;
  insert into public.credit_ledger(user_id, delta, reason, balance_after) values (p_user, p_delta, p_reason, bal);
  return bal;
end $$;
revoke all on function public.adjust_credits(uuid, integer, text) from public, anon, authenticated;

create or replace function public.spend_credits(p_amount integer, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_amount < 1 or p_amount > 15 then return null; end if;
  return public.adjust_credits(auth.uid(), -p_amount, left(p_reason, 120));
end $$;
revoke all on function public.spend_credits(integer, text) from public, anon;
grant execute on function public.spend_credits(integer, text) to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, name, provider, credits)
  values (new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', initcap(replace(split_part(new.email,'@',1),'.',' '))),
    coalesce(new.raw_app_meta_data->>'provider','email'), 10)
  on conflict (id) do nothing;
  insert into public.credit_ledger(user_id, delta, reason, balance_after) values (new.id, 10, 'Welcome bonus', 10);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();