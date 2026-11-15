create table if not exists public.build_questionnaires (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text,
  prompt text not null,
  questions jsonb not null default '[]'::jsonb,
  answers jsonb not null default '[]'::jsonb,
  status text not null default 'asked',
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

alter table public.build_questionnaires enable row level security;

drop policy if exists "own questionnaires select" on public.build_questionnaires;
create policy "own questionnaires select" on public.build_questionnaires for select using (auth.uid() = user_id);

drop policy if exists "own questionnaires insert" on public.build_questionnaires;
create policy "own questionnaires insert" on public.build_questionnaires for insert with check (auth.uid() = user_id);

drop policy if exists "own questionnaires update" on public.build_questionnaires;
create policy "own questionnaires update" on public.build_questionnaires for update using (auth.uid() = user_id);

create index if not exists build_questionnaires_user_idx on public.build_questionnaires(user_id, created_at desc);
