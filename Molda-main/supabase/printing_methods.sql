-- Incremental migration: printing methods by material
-- Safe to run in existing environments (no catalog reset).

create table if not exists public.printing_methods (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.material_printing_methods (
  material_id uuid not null references public.materials(id) on delete cascade,
  printing_method_id uuid not null references public.printing_methods(id) on delete restrict,
  primary key (material_id, printing_method_id)
);

alter table public.printing_methods enable row level security;
alter table public.material_printing_methods enable row level security;

drop policy if exists "admin all printing_methods" on public.printing_methods;
create policy "admin all printing_methods" on public.printing_methods
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all material_printing_methods" on public.material_printing_methods;
create policy "admin all material_printing_methods" on public.material_printing_methods
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read printing methods" on public.printing_methods;
create policy "public read printing methods" on public.printing_methods
for select using (is_active = true);

drop policy if exists "public read material printing methods" on public.material_printing_methods;
create policy "public read material printing methods" on public.material_printing_methods
for select using (true);

insert into public.printing_methods (code, name, description, sort_order, is_active)
values
  ('silk_screen', 'Silk-screen (serigrafia)', 'Indicada para algodão e blends, ótima durabilidade.', 1, true),
  ('dtf', 'DTF (Direct To Film)', 'Boa aderência em vários tecidos e detalhamento alto.', 2, true),
  ('sublimation', 'Sublimação', 'Ideal para poliéster claro, cores vivas e sem relevo.', 3, true),
  ('heat_transfer', 'Transfer térmico', 'Aplicação versátil em pequenas tiragens e personalização rápida.', 4, true),
  ('vinyl_plotter', 'Plotter de recorte (vinil)', 'Bom para nomes, números e artes chapadas.', 5, true),
  ('embroidery', 'Bordado', 'Acabamento premium para logos e peças de maior valor agregado.', 6, true),
  ('uv_dtf', 'UV DTF', 'Adesivação com alta definição para aplicações específicas.', 7, true)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

-- Incremental migration: fabrics available per subtype
create table if not exists public.subtype_materials (
  subtype_id uuid not null references public.product_subtypes(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  primary key (subtype_id, material_id)
);

alter table public.subtype_materials enable row level security;

drop policy if exists "admin all subtype_materials" on public.subtype_materials;
create policy "admin all subtype_materials" on public.subtype_materials
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read subtype_materials" on public.subtype_materials;
create policy "public read subtype_materials" on public.subtype_materials
for select using (true);
