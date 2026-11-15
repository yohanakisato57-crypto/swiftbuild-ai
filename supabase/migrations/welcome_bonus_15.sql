create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, name, provider, credits)
  values (new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', initcap(replace(split_part(new.email,'@',1),'.',' '))),
    coalesce(new.raw_app_meta_data->>'provider','email'), 15)
  on conflict (id) do nothing;
  insert into public.credit_ledger(user_id, delta, reason, balance_after) values (new.id, 15, 'Welcome bonus', 15);
  return new;
end $$;