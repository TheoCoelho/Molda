-- REFERENCE: Rollback Scripts (em caso de erro ou reset)
-- ⚠️ CUIDADO: Estes scripts DELETAM dados. Use apenas em ambiente de teste/dev.

-- ============================================
-- ROLLBACK COMPLETO (desfaz TUDO)
-- ============================================
-- Execute isso APENAS se precisar desfazer toda a implementação

-- 1. Remover triggers
drop trigger if exists update_orders_updated_at on public.orders;
drop trigger if exists assign_order_number_trigger on public.orders;
drop trigger if exists log_order_status_change_trigger on public.orders;

-- 2. Remover funções
drop function if exists public.update_order_updated_at();
drop function if exists public.assign_order_number();
drop function if exists public.log_order_status_change();

-- 3. Remover RLS policies
drop policy if exists "Usuários podem ver seus próprios pedidos" on public.orders;
drop policy if exists "Admin pode ver todos os pedidos" on public.orders;
drop policy if exists "Factory users podem ver todos os pedidos" on public.orders;
drop policy if exists "Usuários podem criar seus próprios pedidos" on public.orders;
drop policy if exists "Factory users podem atualizar pedidos" on public.orders;
drop policy if exists "Admin pode atualizar pedidos" on public.orders;

drop policy if exists "Usuários podem ver eventos de seus pedidos" on public.order_events;
drop policy if exists "Factory users veem todos os eventos" on public.order_events;
drop policy if exists "Admin veem todos os eventos" on public.order_events;
drop policy if exists "Factory users podem criar eventos" on public.order_events;

-- 4. Remover tabelas
drop table if exists public.order_events;
drop table if exists public.orders;

-- 5. Remover usuários factory (opcional - use com cuidado!)
-- delete from auth.users where email like '%.factory';
-- delete from public.profiles where role = 'factory';

-- ============================================
-- RESET DE DADOS (mantem tabelas, limpa dados)
-- ============================================

-- Limpar pedidos e eventos
delete from public.order_events;
delete from public.orders;

-- Confirmação
select 'Reset completo! Tabelas vazias.' as status;
select count(*) as total_orders from public.orders;
select count(*) as total_events from public.order_events;

-- ============================================
-- DELETE APENAS DADOS DE TESTE
-- ============================================

-- Se você quer manter a estrutura mas remover apenas os dados criados no script 04:
delete from public.order_events 
where created_at > now() - interval '1 day'
  and order_id in (
    select id from public.orders 
    where created_at > now() - interval '1 day'
  );

delete from public.orders 
where created_at > now() - interval '1 day';

-- ============================================
-- VERIFICAÇÃO DE LIMPEZA
-- ============================================

select 
  'Tabelas de produção' as seção,
  count(*) as total_pedidos
from public.orders;

select 
  'Eventos de pedidos' as seção,
  count(*) as total_eventos
from public.order_events;

select 
  'Usuários factory' as seção,
  count(*) as total_factory_users
from public.profiles
where role = 'factory';
