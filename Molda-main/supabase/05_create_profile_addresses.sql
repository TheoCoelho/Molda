-- 5. Endereços de entrega por usuário
-- Execute após os scripts anteriores.

create table if not exists public.profile_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  postal_code text not null,
  street text not null,
  number text not null,
  complement text,
  district text not null,
  city text not null,
  state text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_addresses_state_len check (char_length(state) = 2),
  constraint profile_addresses_postal_code_len check (char_length(regexp_replace(postal_code, '[^0-9]', '', 'g')) = 8)
);

create index if not exists profile_addresses_user_id_idx on public.profile_addresses(user_id);
create index if not exists profile_addresses_user_default_idx on public.profile_addresses(user_id, is_default desc, created_at desc);

create or replace function public.update_profile_addresses_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_profile_addresses_updated_at on public.profile_addresses;
create trigger update_profile_addresses_updated_at
  before update on public.profile_addresses
  for each row
  execute function public.update_profile_addresses_updated_at();

alter table public.profile_addresses enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profile_addresses'
      and policyname = 'Users can view own profile addresses'
  ) then
    create policy "Users can view own profile addresses"
      on public.profile_addresses
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profile_addresses'
      and policyname = 'Users can insert own profile addresses'
  ) then
    create policy "Users can insert own profile addresses"
      on public.profile_addresses
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profile_addresses'
      and policyname = 'Users can update own profile addresses'
  ) then
    create policy "Users can update own profile addresses"
      on public.profile_addresses
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profile_addresses'
      and policyname = 'Users can delete own profile addresses'
  ) then
    create policy "Users can delete own profile addresses"
      on public.profile_addresses
      for delete
      using (auth.uid() = user_id);
  end if;
end $$;