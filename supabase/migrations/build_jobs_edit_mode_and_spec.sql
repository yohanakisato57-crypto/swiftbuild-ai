alter table public.build_jobs add column if not exists base_files jsonb;
alter table public.build_jobs add column if not exists spec jsonb;
alter table public.build_jobs add column if not exists job_mode text;
create index if not exists build_jobs_user_status_idx on public.build_jobs(user_id, status);