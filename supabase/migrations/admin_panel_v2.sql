
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists total_time_minutes double precision not null default 0;

create or replace function public.touch_presence() returns void
language plpgsql security definer set search_path = public as $$
declare prev timestamptz;
begin
  if auth.uid() is null then return; end if;
  select last_seen_at into prev from profiles where id = auth.uid();
  update profiles set
    total_time_minutes = total_time_minutes + case when prev is not null and now() - prev <= interval '3 minutes' then extract(epoch from (now() - prev)) / 60.0 else 0 end,
    last_seen_at = now()
  where id = auth.uid();
end $$;
grant execute on function public.touch_presence() to authenticated;

create or replace function public._since(p_period text) returns timestamptz
language sql immutable as $$
  select case p_period
    when 'today' then date_trunc('day', now())
    when '24h' then now() - interval '24 hours'
    when '1m' then now() - interval '1 month'
    when '1y' then now() - interval '1 year'
    else '-infinity'::timestamptz end
$$;

create or replace function public.admin_stats(p_period text)
returns json language plpgsql security definer set search_path = public as $$
declare s timestamptz := public._since(p_period);
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  return json_build_object(
    'total_users', (select count(*) from profiles),
    'new_users', (select count(*) from profiles where created_at >= s),
    'active_users', (select count(*) from profiles where last_seen_at is not null and last_seen_at >= s),
    'paid_customers', (select count(distinct user_id) from orders where credited and created_at >= s),
    'revenue', coalesce((select json_agg(r) from (select currency, sum(amount) as total from orders where credited and created_at >= s group by currency) r), '[]'::json),
    'projects', (select count(*) from projects where created_at >= s),
    'credits_used', coalesce((select -sum(delta) from credit_ledger where delta < 0 and created_at >= s), 0)
  );
end $$;

create or replace function public.admin_users_v2()
returns table(id uuid, name text, email text, credits integer, created_at timestamptz, last_seen_at timestamptz, total_time_minutes double precision, is_paid boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  return query select p.id, p.name::text, p.email::text, p.credits::int, p.created_at, p.last_seen_at, p.total_time_minutes,
    exists(select 1 from orders o where o.user_id = p.id and o.credited)
  from profiles p order by coalesce(p.last_seen_at, p.created_at) desc limit 1000;
end $$;

create or replace function public.admin_adjust_credits(p_user uuid, p_amount integer, p_note text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare nb int;
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 100000 then raise exception 'invalid amount'; end if;
  update profiles set credits = credits + p_amount where id = p_user and credits + p_amount >= 0 returning credits into nb;
  if nb is null then raise exception 'user not found or balance would go below zero'; end if;
  insert into credit_ledger(user_id, delta, reason, balance_after)
    values (p_user, p_amount, coalesce(nullif(p_note,''), case when p_amount > 0 then 'Admin credit top-up' else 'Admin credit deduction' end), nb);
  return nb;
end $$;

create or replace function public.admin_user_detail(p_user uuid)
returns json language plpgsql security definer set search_path = public as $$
declare purchased bigint; pos bigint; neg bigint;
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  select coalesce(sum(credits),0) into purchased from orders where user_id = p_user and credited;
  select coalesce(sum(delta) filter (where delta > 0),0), coalesce(-sum(delta) filter (where delta < 0),0) into pos, neg from credit_ledger where user_id = p_user;
  return json_build_object(
    'profile', (select row_to_json(x) from (select id, name, email, credits, created_at, last_seen_at, total_time_minutes from profiles where id = p_user) x),
    'purchased', purchased,
    'granted', greatest(pos - purchased, 0),
    'used', neg,
    'projects', coalesce((select json_agg(x) from (select id, title, mode, cost, created_at from projects where user_id = p_user order by created_at desc limit 200) x), '[]'::json),
    'orders', coalesce((select json_agg(x) from (select id, reference, credits, amount, currency, status, credited, created_at from orders where user_id = p_user order by created_at desc limit 100) x), '[]'::json),
    'ledger', coalesce((select json_agg(x) from (select delta, reason, balance_after, created_at from credit_ledger where user_id = p_user order by created_at desc limit 30) x), '[]'::json)
  );
end $$;

grant execute on function public.admin_stats(text), public.admin_users_v2(), public.admin_adjust_credits(uuid,integer,text), public.admin_user_detail(uuid) to authenticated;
