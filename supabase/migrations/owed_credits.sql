alter table public.build_jobs add column if not exists owed_credits int not null default 0;
alter table public.projects add column if not exists owed_credits int not null default 0;