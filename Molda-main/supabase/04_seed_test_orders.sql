-- 4. Seed de Pedidos de Teste (TEST DATA)
-- Execute no SQL Editor do Supabase APÓS executar todos os scripts anteriores (01, 02, 03)
-- Isso cria pedidos de exemplo para testar o dashboard da fábrica

create extension if not exists pgcrypto;

-- ============================================
-- HELPER: inserir pedidos de teste
-- ============================================

do $$
declare
  v_customer_id uuid;
  v_material_id uuid;
  v_material_name text;
  v_total_inserted int := 0;
begin
  raise notice 'Iniciando seed de pedidos de teste...';
  
  -- Seleciona um cliente de teste (qualquer um)
  select id into v_customer_id
  from auth.users
  where email like '%.teste@molda.dev'
  limit 1;
  
  if v_customer_id is null then
    raise notice 'ERRO: Nenhum cliente de teste encontrado. Execute primeiro o script de seed de usuários.';
    return;
  end if;

  select id, name into v_material_id, v_material_name
  from public.materials
  where coalesce(is_active, true)
  order by name asc
  limit 1;

  if v_material_id is null then
    raise notice 'ERRO: Nenhum material ativo encontrado. Cadastre materiais antes de rodar o seed de pedidos.';
    return;
  end if;
  
  raise notice 'Cliente selecionado: %', v_customer_id;
  raise notice 'Material selecionado: % (%)', v_material_name, v_material_id;
  
  -- Insere vários pedidos de exemplo
  insert into public.orders (
    user_id,
    status,
    design_3d_model_path,
    design_preview_url,
    design_specifications,
    material_id,
    material_quantity,
    material_unit,
    decals_paths,
    colors,
    inscriptions,
    unit_price,
    quantity,
    material_cost,
    production_cost,
    total_cost,
    delivery_type,
    shipping_cost,
    shipping_address_street,
    shipping_address_number,
    shipping_address_district,
    shipping_address_city,
    shipping_address_state,
    shipping_address_postal_code,
    created_at
  )
  select
    v_customer_id,
    t.status,
    t.model_path,
    t.preview_url,
    t.specifications::jsonb,
    v_material_id,
    greatest(t.qty::numeric, 1),
    'un',
    t.decals::jsonb,
    t.colors::jsonb,
    t.inscriptions,
    t.unit_price,
    t.qty,
    t.material_cost,
    t.production_cost,
    t.total_cost,
    t.delivery,
    t.shipping,
    t.street,
    t.number,
    t.district,
    t.city,
    t.state,
    t.postal,
    now() - interval '1 hour' * t.hours_ago
  from
    (values
      -- Camiseta básica preta
      ('pending', 'models/tshirt_basic.stl', 'preview/tshirt_01.jpg',
       '{"size":"M","material_type":"cotton_100","fit":"regular","sleeve":"short"}',
       '["decals/logo.png","decals/custom_text.png"]',
       '{"primary":"black"}',
       'Molda Design',
       89.90, 1, 15.00, 25.00, 129.90, 'standard', 15.00,
       'Rua das Flores', '123', 'Centro', 'São Paulo', 'SP', '01310-100', 2),
       
      -- Camiseta branca com estampa grande
      ('approved', 'models/tshirt_oversize.stl', 'preview/tshirt_02.jpg',
       '{"size":"L","material_type":"cotton_100","fit":"oversize","sleeve":"short"}',
       '["decals/full_print.png"]',
       '{"primary":"white"}',
       'Custom Print',
       129.90, 2, 20.00, 35.00, 314.80, 'express', 25.00,
       'Av. Paulista', '1000', 'Bela Vista', 'São Paulo', 'SP', '01311-100', 6),
       
      -- Manga longa cinza
      ('production', 'models/tshirt_long_sleeve.stl', 'preview/tshirt_03.jpg',
       '{"size":"M","material_type":"cotton_blend","fit":"slim","sleeve":"long"}',
       '["decals/sleeve_print.png"]',
       '{"primary":"gray"}',
       '',
       99.90, 1, 18.00, 30.00, 147.90, 'standard', 18.00,
       'Rua Augusta', '500', 'Consolação', 'São Paulo', 'SP', '01305-100', 12),
       
      -- Camiseta preta com múltiplos adesivos
      ('quality_check', 'models/tshirt_basic.stl', 'preview/tshirt_04.jpg',
       '{"size":"G","material_type":"cotton_100","fit":"regular","sleeve":"short"}',
       '["decals/logo_front.png","decals/logo_back.png","decals/cuff_print.png"]',
       '{"primary":"black","secondary":"white"}',
       'Front + Back Print',
       89.90, 1, 15.00, 40.00, 144.90, 'standard', 10.00,
       'Rua das Acácias', '250', 'Jardins', 'São Paulo', 'SP', '01434-010', 18),
       
      -- Camiseta infantil azul
      ('ready_to_ship', 'models/tshirt_kids.stl', 'preview/tshirt_05.jpg',
       '{"size":"XS","material_type":"cotton_100","fit":"regular","sleeve":"short"}',
       '["decals/kids_design.png"]',
       '{"primary":"royal_blue"}',
       'Kids Collection',
       59.90, 3, 12.00, 20.00, 209.70, 'economy', 8.00,
       'Rua Oscar Freire', '200', 'Pinheiros', 'São Paulo', 'SP', '05409-011', 24),
       
      -- Camiseta vermelha com inscrição
      ('shipped', 'models/tshirt_basic.stl', 'preview/tshirt_06.jpg',
       '{"size":"P","material_type":"cotton_100","fit":"regular","sleeve":"short"}',
       '["decals/custom_style.png"]',
       '{"primary":"red"}',
       'Personalizada - João Silva',
       89.90, 1, 15.00, 25.00, 129.90, 'standard', 12.00,
       'Rua 25 de Março', '1501', 'Centro', 'São Paulo', 'SP', '01223-000', 36),
       
      -- Camiseta verde entregue
      ('delivered', 'models/tshirt_basic.stl', 'preview/tshirt_07.jpg',
       '{"size":"M","material_type":"cotton_100","fit":"regular","sleeve":"short"}',
       '["decals/environmental_print.png"]',
       '{"primary":"forest_green"}',
       'Eco Collection',
       89.90, 1, 15.00, 25.00, 129.90, 'standard', 15.00,
       'Rua Consolação', '1400', 'Centro', 'São Paulo', 'SP', '01301-100', 48)
    ) as t(
      status, model_path, preview_url, specifications,
      decals, colors, inscriptions,
      unit_price, qty, material_cost, production_cost, total_cost,
      delivery, shipping,
      street, number, district, city, state, postal,
      hours_ago
    )
  limit 10;
  
  get diagnostics v_total_inserted = row_count;
  raise notice '✓ % pedidos de teste criados com sucesso!', v_total_inserted;
  
end $$;

-- ============================================
-- Verificar pedidos criados
-- ============================================
select 
  order_number,
  status,
  total_cost,
  delivery_type,
  created_at,
  updated_at
from public.orders
order by created_at desc
limit 10;

-- ============================================
-- Estatísticas dos pedidos
-- ============================================
select 
  status,
  count(*) as total,
  avg(total_cost) as preco_medio,
  sum(total_cost) as total_vendas
from public.orders
group by status
order by total desc;
