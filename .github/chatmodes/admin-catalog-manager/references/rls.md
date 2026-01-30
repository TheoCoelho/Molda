# RLS Policies (Supabase)

Use a role field in profiles (profiles.role = admin | editor | viewer).
Never rely only on client checks. Enforce in RLS.

## Helper (optional)
-- create a SQL function to check role
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

## Enable RLS
alter table public.parts enable row level security;
alter table public.product_types enable row level security;
alter table public.product_subtypes enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.materials enable row level security;
alter table public.suppliers enable row level security;
alter table public.product_materials enable row level security;
alter table public.inventory enable row level security;

## Admin full access
create policy "admin all parts" on public.parts
for all using (is_admin()) with check (is_admin());

-- repeat for each table

## Public read (available only)
create policy "public read types" on public.product_types
for select using (is_active = true);

create policy "public read subtypes" on public.product_subtypes
for select using (is_active = true);

create policy "public read products" on public.products
for select using (available = true and visible = true);

## Inventory is admin only
create policy "admin inventory" on public.inventory
for all using (is_admin()) with check (is_admin());

## Notes
- You can add an editor role with read/write to catalog but not inventory.
- If you use app_metadata roles, update is_admin() to check auth.jwt().
