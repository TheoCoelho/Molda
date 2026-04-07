-- 2. Configurar Role "factory" e permissões no banco de dados
-- Execute no SQL Editor do Supabase APÓS executar o script 01_create_orders_tables.sql

-- ============================================
-- ATUALIZAR FUNÇÃO: update_role (se necessário)
-- ============================================
-- Certifique-se de que a coluna role aceita 'factory'
-- (já deve existir em profiles com text default 'viewer')

-- Se a coluna role ainda não existir, execute:
-- ALTER TABLE public.profiles
-- ADD COLUMN if not exists role text default 'viewer';

-- ============================================
-- RLS (Row Level Security) para ORDERS
-- ============================================

-- Habilitar RLS na tabela orders
alter table public.orders enable row level security;

-- Política: Usuários podem ver seus próprios pedidos
create policy "Usuários podem ver seus próprios pedidos"
  on public.orders
  for select
  using (auth.uid() = user_id);

-- Política: Admin pode ver todos os pedidos
create policy "Admin pode ver todos os pedidos"
  on public.orders
  for select
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- Política: Factory users podem ver todos os pedidos
create policy "Factory users podem ver todos os pedidos"
  on public.orders
  for select
  using (
    (select role from public.profiles where id = auth.uid()) = 'factory'
  );

-- Política: Apenas o customer pode criar um pedido para si mesmo
create policy "Usuários podem criar seus próprios pedidos"
  on public.orders
  for insert
  with check (auth.uid() = user_id);

-- Política: Factory users podem atualizar pedidos
create policy "Factory users podem atualizar pedidos"
  on public.orders
  for update
  using (
    (select role from public.profiles where id = auth.uid()) = 'factory'
  )
  with check (
    (select role from public.profiles where id = auth.uid()) = 'factory'
  );

-- Política: Admin pode atualizar qualquer pedido
create policy "Admin pode atualizar pedidos"
  on public.orders
  for update
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- ============================================
-- RLS para ORDER_EVENTS
-- ============================================

alter table public.order_events enable row level security;

-- Política: Usuários podem ver eventos de seus próprios pedidos
create policy "Usuários podem ver eventos de seus pedidos"
  on public.order_events
  for select
  using (
    order_id in (
      select id from public.orders where user_id = auth.uid()
    )
  );

-- Política: Factory users veem todos os eventos
create policy "Factory users veem todos os eventos"
  on public.order_events
  for select
  using (
    (select role from public.profiles where id = auth.uid()) = 'factory'
  );

-- Política: Admin veem todos os eventos
create policy "Admin veem todos os eventos"
  on public.order_events
  for select
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- Política: Factory users podem inserir eventos
create policy "Factory users podem criar eventos"
  on public.order_events
  for insert
  with check (
    (select role from public.profiles where id = auth.uid()) = 'factory'
      or (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- ============================================
-- FUNÇÃO: log_order_status_change
-- Registra automaticamente mudanças de status na tabela order_events
-- ============================================

create or replace function public.log_order_status_change()
returns trigger as $$
begin
  if new.status is distinct from old.status then
    insert into public.order_events (
      order_id,
      event_type,
      triggered_by,
      previous_status,
      new_status,
      notes
    ) values (
      new.id,
      'status_changed',
      auth.uid(),
      old.status,
      new.status,
      format('Status alterado de %L para %L', old.status, new.status)
    );
  end if;
  return new;
end;
$$ language plpgsql;

-- Trigger para log automático
drop trigger if exists log_order_status_change_trigger on public.orders;
create trigger log_order_status_change_trigger
  after update on public.orders
  for each row
  execute function public.log_order_status_change();

-- ============================================
-- FUNÇÃO: assign_order_number
-- Gera automaticamente o número do pedido se não for fornecido
-- ============================================

create or replace function public.assign_order_number()
returns trigger as $$
declare
  v_year text;
  v_sequence int;
begin
  if new.order_number is null then
    v_year := extract(year from now())::text;
    
    -- Pega o próximo número sequencial do ano
    select coalesce(count(*)::int, 0) + 1 into v_sequence
    from public.orders
    where order_number like v_year || '-%';
    
    new.order_number := format('ORD-%s-%06d', v_year, v_sequence);
  end if;
  
  return new;
end;
$$ language plpgsql;

-- Trigger para gerar número do pedido
drop trigger if exists assign_order_number_trigger on public.orders;
create trigger assign_order_number_trigger
  before insert on public.orders
  for each row
  execute function public.assign_order_number();
