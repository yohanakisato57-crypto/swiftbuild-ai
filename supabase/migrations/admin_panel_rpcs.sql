create or replace function public._is_admin() returns boolean language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email','')) = 'yohanakisato57@gmail.com'
$$;

create or replace function public.admin_stats() returns json language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  return json_build_object(
    'users', (select count(*) from profiles),
    'projects', (select count(*) from projects),
    'revenue', coalesce((select json_agg(r) from (select currency, sum(amount) as total from orders where credited group by currency) r), '[]'::json),
    'credits_used', coalesce((select -sum(delta) from credit_ledger where delta < 0), 0)
  );
end $$;

create or replace function public.admin_users() returns table(id uuid, name text, email text, credits int, created_at timestamptz) language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  return query select p.id, p.name::text, p.email::text, p.credits::int, p.created_at from profiles p order by p.created_at desc limit 500;
end $$;

create or replace function public.admin_orders() returns table(id bigint, email text, reference text, credits int, amount numeric, currency text, status text, credited boolean, created_at timestamptz) language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  return query select o.id::bigint, p.email::text, o.reference::text, o.credits::int, o.amount::numeric, o.currency::text, o.status::text, o.credited, o.created_at from orders o left join profiles p on p.id = o.user_id order by o.created_at desc limit 100;
end $$;

create or replace function public.admin_add_credits(p_user uuid, p_amount int) returns int language plpgsql security definer set search_path = public as $$
declare nb int;
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then raise exception 'invalid amount'; end if;
  update profiles set credits = credits + p_amount where id = p_user returning credits into nb;
  if nb is null then raise exception 'user not found'; end if;
  insert into credit_ledger(user_id, delta, reason, balance_after) values (p_user, p_amount, 'Admin credit top-up', nb);
  return nb;
end $$;

grant execute on function public.admin_stats(), public.admin_users(), public.admin_orders(), public.admin_add_credits(uuid,int) to authenticated;