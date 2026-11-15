create table if not exists public.templates (
  id text primary key,
  name text not null,
  category text not null,
  thumbnail_url text not null,
  prompt text not null,
  base_users integer not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.templates enable row level security;

drop policy if exists "templates readable by signed-in users" on public.templates;
create policy "templates readable by signed-in users" on public.templates
  for select to authenticated using (true);

create table if not exists public.template_unlocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id text not null references public.templates(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, template_id)
);

alter table public.template_unlocks enable row level security;

drop policy if exists "users read own unlocks" on public.template_unlocks;
create policy "users read own unlocks" on public.template_unlocks
  for select to authenticated using (auth.uid() = user_id);

-- Premium gate: a template may only be used once the user has a completed
-- Pesapal purchase. Offer/trial credits never satisfy this.
create or replace function public.has_premium_purchase(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders o
    where o.user_id = p_user and o.credited = true and o.status = 'completed'
  );
$$;

create or replace function public.use_template(p_template text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_prompt text;
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.';
  end if;
  if not public.has_premium_purchase(auth.uid()) then
    raise exception 'Unlock Premium Template: buy a Premium package via Pesapal first.';
  end if;
  select prompt into v_prompt from public.templates where id = p_template;
  if v_prompt is null then
    raise exception 'Template not found.';
  end if;
  insert into public.template_unlocks (user_id, template_id)
    values (auth.uid(), p_template) on conflict do nothing;
  return v_prompt;
end;
$$;

grant execute on function public.use_template(text) to authenticated;

insert into public.templates (id, name, category, thumbnail_url, prompt, base_users, sort_order) values
(
  'social-scheduler',
  'Social Media Post Scheduler by Muhammad Ansar',
  'Social Media Tool',
  'https://images.unsplash.com/photo-1542744095-291d1f67b221?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
  'Build a social media post scheduler by Muhammad Ansar: a dark dashboard with a calendar view, a compose panel with per-platform previews, a queue of scheduled posts, and buttons to publish now or schedule. Use electric-lime accents and compact one-screen layout.',
  1200, 1
),
(
  'leadgen-ai',
  'LeadGen AI - Build High-Converting Lead Funnels',
  'Lead Generation',
  'https://images.unsplash.com/photo-1551288049-bebda4e38f71?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
  'Build LeadGen AI, a funnel builder with a headline hero, lead capture form, funnel step editor, conversion analytics cards with a line chart, and an A/B variant comparison. Dark graphite theme with electric-lime accents.',
  2500, 2
)
on conflict (id) do update set
  name = excluded.name, category = excluded.category, thumbnail_url = excluded.thumbnail_url,
  prompt = excluded.prompt, base_users = excluded.base_users, sort_order = excluded.sort_order;
