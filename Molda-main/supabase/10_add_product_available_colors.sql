-- Adiciona lista de cores disponiveis por produto.
alter table if exists public.products
  add column if not exists available_colors text[];

comment on column public.products.available_colors is
  'Cores disponiveis para selecao no configurador, no formato #RRGGBB.';
