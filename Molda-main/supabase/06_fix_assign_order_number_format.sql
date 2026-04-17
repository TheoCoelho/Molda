-- 6. Correção da função assign_order_number
-- Problema: PostgreSQL format() não suporta %d (apenas %s, %I, %L).
-- Isso causava erro 22023 ao inserir pedidos.

create or replace function public.assign_order_number()
returns trigger as $$
declare
  v_year text;
  v_sequence int;
begin
  if new.order_number is null then
    v_year := extract(year from now())::text;

    -- Usa o maior sufixo numérico já existente no ano corrente.
    select coalesce(max(right(order_number, 6)::int), 0) + 1 into v_sequence
    from public.orders
    where order_number like ('ORD-' || v_year || '-%')
      and right(order_number, 6) ~ '^[0-9]{6}$';

    new.order_number := format('ORD-%s-%s', v_year, lpad(v_sequence::text, 6, '0'));
  end if;

  return new;
end;
$$ language plpgsql;

-- Garante o trigger ativo apontando para a função corrigida.
drop trigger if exists assign_order_number_trigger on public.orders;
create trigger assign_order_number_trigger
  before insert on public.orders
  for each row
  execute function public.assign_order_number();
