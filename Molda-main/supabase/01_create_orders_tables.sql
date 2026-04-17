-- 1. Criar tabelas para sistema de Ordens (Pedidos)
-- Execute no SQL Editor do Supabase em ordem numérica

-- ============================================
-- TABELA: public.orders
-- ============================================
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null, -- Ex: "ORD-2026-001234"
  user_id uuid not null references auth.users(id) on delete restrict,
  factory_user_id uuid references auth.users(id) on delete set null, -- Usuário da fábrica responsável
  
  -- Status do pedido
  status text not null default 'pending', -- pending, approved, production, quality_check, ready_to_ship, shipped, delivered, cancelled
  
  -- Dados da Peça/Design
  design_id uuid, -- FK para tabela de designs (se existir)
  design_3d_model_path text, -- Caminho para arquivo 3D (STL, OBJ, etc)
  design_preview_url text, -- URL da imagem de preview
  design_specifications jsonb not null default '{}', -- Todas as características técnicas
  
  -- Materiais
  material_id uuid references public.materials(id) on delete set null,
  material_quantity decimal(10, 2),
  material_unit text, -- 'g', 'kg', 'ml', etc
  material_properties jsonb default '{}', -- Propriedades adicionais
  
  -- Customizações
  decals_paths jsonb default '[]'::jsonb, -- Array de caminhos para decals/adesivos
  colors jsonb default '{}'::jsonb, -- Cores selecionadas
  inscriptions text, -- Inscrições/textos personalizados
  custom_metadata jsonb default '{}'::jsonb, -- Dados customizados adicionais
  
  -- Preços
  unit_price decimal(10, 2) not null,
  quantity int not null default 1,
  material_cost decimal(10, 2) default 0,
  production_cost decimal(10, 2) default 0,
  subtotal decimal(10, 2) not null generated always as (unit_price * quantity) stored,
  total_cost decimal(10, 2) not null,
  
  -- Entrega
  delivery_type text not null default 'standard', -- standard, express, economy
  shipping_cost decimal(10, 2) default 0,
  tracking_number text,
  
  -- Endereço de entrega
  shipping_address_street text,
  shipping_address_number text,
  shipping_address_complement text,
  shipping_address_district text,
  shipping_address_city text,
  shipping_address_state text,
  shipping_address_postal_code text,
  shipping_address_country text default 'BR',
  
  -- Produção
  production_started_at timestamptz,
  production_completed_at timestamptz,
  quality_check_notes text,
  
  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Índices para performance
  constraint orders_status_check check (status in ('pending', 'approved', 'production', 'quality_check', 'ready_to_ship', 'shipped', 'delivered', 'cancelled'))
);

-- Índices para consultas frequentes
create index if not exists orders_user_id_idx on public.orders(user_id);
create index if not exists orders_factory_user_id_idx on public.orders(factory_user_id);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_order_number_idx on public.orders(order_number);
create index if not exists orders_created_at_idx on public.orders(created_at desc);

-- ============================================
-- TABELA: public.order_events (Auditoria)
-- ============================================
create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null, -- created, approved, started, paused, completed, shipped, delivered, cancelled, quality_check_failed, etc
  triggered_by uuid references auth.users(id) on delete set null, -- Quem fez a ação
  
  -- Detalhes do evento
  details jsonb default '{}'::jsonb, -- Dados adicionais do evento
  notes text, -- Notas/observações
  
  -- Status anterior (para auditoria)
  previous_status text,
  new_status text,
  
  created_at timestamptz not null default now()
);

-- Índices
create index if not exists order_events_order_id_idx on public.order_events(order_id);
create index if not exists order_events_triggered_by_idx on public.order_events(triggered_by);
create index if not exists order_events_created_at_idx on public.order_events(created_at desc);

-- ============================================
-- FUNÇÃO: update_order_updated_at
-- ============================================
create or replace function public.update_order_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger para atualizar updated_at automaticamente
drop trigger if exists update_orders_updated_at on public.orders;
create trigger update_orders_updated_at
  before update on public.orders
  for each row
  execute function public.update_order_updated_at();
