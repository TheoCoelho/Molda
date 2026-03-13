create table if not exists public.gallery_visibility (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  is_public boolean not null default false,
  design_value numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, storage_path)
);

alter table public.gallery_visibility
  add column if not exists design_value numeric(10,2);

create index if not exists gallery_visibility_user_id_idx
  on public.gallery_visibility(user_id);

create index if not exists gallery_visibility_public_idx
  on public.gallery_visibility(is_public);

create or replace function public.touch_gallery_visibility_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_gallery_visibility_updated_at on public.gallery_visibility;

create trigger trg_gallery_visibility_updated_at
before update on public.gallery_visibility
for each row
execute function public.touch_gallery_visibility_updated_at();

alter table public.gallery_visibility enable row level security;

drop policy if exists "owners can read own gallery visibility" on public.gallery_visibility;
drop policy if exists "owners can insert own gallery visibility" on public.gallery_visibility;
drop policy if exists "owners can update own gallery visibility" on public.gallery_visibility;

create policy "owners can read own gallery visibility"
on public.gallery_visibility
for select
using (auth.uid() = user_id);

create policy "owners can insert own gallery visibility"
on public.gallery_visibility
for insert
with check (auth.uid() = user_id);

create policy "owners can update own gallery visibility"
on public.gallery_visibility
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
