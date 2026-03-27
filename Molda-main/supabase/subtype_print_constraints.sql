-- Incremental migration: print constraints per subtype
-- Safe to run in existing environments.

alter table public.product_subtypes
  add column if not exists print_area_width_cm numeric,
  add column if not exists print_area_height_cm numeric,
  add column if not exists min_decal_area_cm2 numeric default 5,
  add column if not exists neck_zone_y_min numeric default 0.82,
  add column if not exists underarm_zone_y_min numeric default 0.45,
  add column if not exists underarm_zone_y_max numeric default 0.72,
  add column if not exists underarm_zone_abs_x_min numeric default 0.55;

alter table public.product_subtypes
  drop constraint if exists product_subtypes_print_area_width_cm_positive,
  add constraint product_subtypes_print_area_width_cm_positive
    check (print_area_width_cm is null or print_area_width_cm > 0);

alter table public.product_subtypes
  drop constraint if exists product_subtypes_print_area_height_cm_positive,
  add constraint product_subtypes_print_area_height_cm_positive
    check (print_area_height_cm is null or print_area_height_cm > 0);

alter table public.product_subtypes
  drop constraint if exists product_subtypes_min_decal_area_cm2_positive,
  add constraint product_subtypes_min_decal_area_cm2_positive
    check (min_decal_area_cm2 is null or min_decal_area_cm2 > 0);

alter table public.product_subtypes
  drop constraint if exists product_subtypes_neck_zone_y_min_range,
  add constraint product_subtypes_neck_zone_y_min_range
    check (neck_zone_y_min is null or (neck_zone_y_min >= 0 and neck_zone_y_min <= 1));

alter table public.product_subtypes
  drop constraint if exists product_subtypes_underarm_zone_y_min_range,
  add constraint product_subtypes_underarm_zone_y_min_range
    check (underarm_zone_y_min is null or (underarm_zone_y_min >= 0 and underarm_zone_y_min <= 1));

alter table public.product_subtypes
  drop constraint if exists product_subtypes_underarm_zone_y_max_range,
  add constraint product_subtypes_underarm_zone_y_max_range
    check (underarm_zone_y_max is null or (underarm_zone_y_max >= 0 and underarm_zone_y_max <= 1));

alter table public.product_subtypes
  drop constraint if exists product_subtypes_underarm_zone_abs_x_min_range,
  add constraint product_subtypes_underarm_zone_abs_x_min_range
    check (underarm_zone_abs_x_min is null or (underarm_zone_abs_x_min >= 0 and underarm_zone_abs_x_min <= 1));

update public.product_subtypes
set min_decal_area_cm2 = 5
where min_decal_area_cm2 is null;
