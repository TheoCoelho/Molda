-- Catalog schema + RLS policies for admin catalog
-- Run in Supabase SQL editor.

create extension if not exists pgcrypto;

-- Ensure role column exists for admin checks
alter table public.profiles
add column if not exists role text default 'viewer';

-- Core tables
create table if not exists public.parts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.product_types (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.parts(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  card_image_path text,
  sort_order int default 0,
  is_active boolean default true
);

create unique index if not exists product_types_part_slug
  on public.product_types(part_id, slug);

create table if not exists public.product_subtypes (
  id uuid primary key default gen_random_uuid(),
  type_id uuid not null references public.product_types(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  card_image_path text,
  sort_order int default 0,
  is_active boolean default true
);

create unique index if not exists product_subtypes_type_slug
  on public.product_subtypes(type_id, slug);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  type_id uuid not null references public.product_types(id) on delete restrict,
  subtype_id uuid references public.product_subtypes(id) on delete set null,
  sku text unique not null,
  name text not null,
  description text,
  available boolean default true,
  visible boolean default true,
  cover_image_path text,
  created_at timestamptz default now()
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_path text not null,
  alt_text text,
  sort_order int default 0
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean default true
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  is_active boolean default true
);

create table if not exists public.product_materials (
  product_id uuid not null references public.products(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete set null,
  primary key (product_id, material_id)
);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  product_id uuid unique not null references public.products(id) on delete cascade,
  on_hand int default 0,
  reserved int default 0,
  updated_at timestamptz default now()
);

-- Optional: stock movements log
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  delta int not null,
  reason text,
  created_at timestamptz default now(),
  created_by uuid
);

-- RLS helper
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

-- Enable RLS
alter table public.parts enable row level security;
alter table public.product_types enable row level security;
alter table public.product_subtypes enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.materials enable row level security;
alter table public.suppliers enable row level security;
alter table public.product_materials enable row level security;
alter table public.inventory enable row level security;
alter table public.stock_movements enable row level security;

-- Admin full access
create policy "admin all parts" on public.parts
for all using (public.is_admin()) with check (public.is_admin());

create policy "admin all types" on public.product_types
for all using (public.is_admin()) with check (public.is_admin());

create policy "admin all subtypes" on public.product_subtypes
for all using (public.is_admin()) with check (public.is_admin());

create policy "admin all products" on public.products
for all using (public.is_admin()) with check (public.is_admin());

create policy "admin all product_images" on public.product_images
for all using (public.is_admin()) with check (public.is_admin());

create policy "admin all materials" on public.materials
for all using (public.is_admin()) with check (public.is_admin());

create policy "admin all suppliers" on public.suppliers
for all using (public.is_admin()) with check (public.is_admin());

create policy "admin all product_materials" on public.product_materials
for all using (public.is_admin()) with check (public.is_admin());

create policy "admin all inventory" on public.inventory
for all using (public.is_admin()) with check (public.is_admin());

create policy "admin all stock_movements" on public.stock_movements
for all using (public.is_admin()) with check (public.is_admin());

-- Public read (only active/available)
create policy "public read parts" on public.parts
for select using (is_active = true);

create policy "public read types" on public.product_types
for select using (is_active = true);

create policy "public read subtypes" on public.product_subtypes
for select using (is_active = true);

create policy "public read products" on public.products
for select using (available = true and visible = true);

-- Storage policies (bucket: product-images)
-- Note: storage.objects uses bucket_id for bucket name
create policy "public read product images" on storage.objects
for select using (bucket_id = 'product-images');

create policy "admin write product images" on storage.objects
for all using (bucket_id = 'product-images' and public.is_admin())
with check (bucket_id = 'product-images' and public.is_admin());
