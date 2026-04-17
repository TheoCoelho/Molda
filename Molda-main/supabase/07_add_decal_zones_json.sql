-- Incremental migration: custom 3D decal zones per subtype
-- Safe to run in existing environments.

alter table public.product_subtypes
  add column if not exists decal_zones_json jsonb default '[]'::jsonb;

update public.product_subtypes
set decal_zones_json = '[]'::jsonb
where decal_zones_json is null;

alter table public.product_subtypes
  alter column decal_zones_json set default '[]'::jsonb;
