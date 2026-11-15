create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  custom_instructions text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
drop policy if exists "own settings read" on public.user_settings;
create policy "own settings read" on public.user_settings for select using (auth.uid() = user_id);
drop policy if exists "own settings insert" on public.user_settings;
create policy "own settings insert" on public.user_settings for insert with check (auth.uid() = user_id);
drop policy if exists "own settings update" on public.user_settings;
create policy "own settings update" on public.user_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.update_my_name(p_name text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or length(trim(p_name)) < 1 then return null; end if;
  update public.profiles set name = left(trim(p_name), 60) where id = auth.uid();
  return left(trim(p_name), 60);
end $$;
revoke all on function public.update_my_name(text) from public, anon;
grant execute on function public.update_my_name(text) to authenticated;