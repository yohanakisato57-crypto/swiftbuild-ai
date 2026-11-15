alter table public.profiles add column if not exists referred_by uuid references auth.users(id) on delete set null;
create table if not exists public.referral_rewards (
  id bigserial primary key,
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_id uuid not null unique references auth.users(id) on delete cascade,
  credits integer not null default 60,
  created_at timestamptz not null default now()
);
alter table public.referral_rewards enable row level security;
drop policy if exists "own rewards read" on public.referral_rewards;
create policy "own rewards read" on public.referral_rewards for select using (auth.uid() = referrer_id);

create or replace function public.claim_referral(p_ref uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  if auth.uid() is null or p_ref = auth.uid() then return false; end if;
  if not exists (select 1 from public.profiles where id = p_ref) then return false; end if;
  update public.profiles set referred_by = p_ref
    where id = auth.uid() and referred_by is null and created_at > now() - interval '2 days'
    returning true into ok;
  return coalesce(ok, false);
end $$;
revoke all on function public.claim_referral(uuid) from public, anon;
grant execute on function public.claim_referral(uuid) to authenticated;

create or replace function public.reward_referral(p_user uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare ref uuid; ins int;
begin
  select referred_by into ref from public.profiles where id = p_user;
  if ref is null then return 0; end if;
  insert into public.referral_rewards(referrer_id, referred_id, credits) values (ref, p_user, 60)
    on conflict (referred_id) do nothing;
  get diagnostics ins = row_count;
  if ins = 0 then return 0; end if;
  perform public.adjust_credits(ref, 60, 'Referral reward: friend purchased first package');
  return 60;
end $$;
revoke all on function public.reward_referral(uuid) from public, anon, authenticated;