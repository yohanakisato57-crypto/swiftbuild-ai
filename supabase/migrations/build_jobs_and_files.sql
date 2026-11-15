create table if not exists public.build_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.chat_sessions(id) on delete cascade,
  prompt text not null,
  status text not null default 'queued',
  stage text,
  title text,
  total_files int not null default 0,
  done_files int not null default 0,
  cost int not null default 0,
  error text,
  project_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.build_files (
  id bigserial primary key,
  job_id uuid not null references public.build_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  idx int not null,
  name text not null,
  purpose text,
  lang text not null,
  content text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (job_id, idx)
);

create index if not exists build_files_job_idx on public.build_files(job_id, idx);

alter table public.build_jobs enable row level security;
alter table public.build_files enable row level security;

drop policy if exists "own build jobs" on public.build_jobs;
create policy "own build jobs" on public.build_jobs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own build files" on public.build_files;
create policy "own build files" on public.build_files for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter publication supabase_realtime add table public.build_jobs;
alter publication supabase_realtime add table public.build_files;