-- Migration: adiciona coluna ephemeral_expires_at em project_drafts
-- Permite limpeza server-side eficiente de rascunhos não salvos expirados.
-- Execute no SQL Editor do Supabase.

-- 1. Adiciona coluna (nullable — NULL significa permanente ou sem expiração)
alter table public.project_drafts
  add column if not exists ephemeral_expires_at timestamptz default null;

-- 2. Índice para acelerar a query de limpeza e filtros de expiração
create index if not exists idx_project_drafts_ephemeral_expires_at
  on public.project_drafts (ephemeral_expires_at)
  where ephemeral_expires_at is not null;

-- 3. Backfill: popula a coluna nova a partir do valor já salvo no JSONB data
--    Rascunhos sem ephemeralExpiresAt no JSONB ou com isPermanent=true ficam com NULL.
update public.project_drafts
set ephemeral_expires_at = (data->>'ephemeralExpiresAt')::timestamptz
where
  data->>'isPermanent' is distinct from 'true'
  and data->>'ephemeralExpiresAt' is not null
  and ephemeral_expires_at is null;

-- 4. Função de limpeza (pode ser chamada manualmente ou por pg_cron)
create or replace function public.delete_expired_ephemeral_drafts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count int;
begin
  delete from public.project_drafts
  where ephemeral_expires_at is not null
    and ephemeral_expires_at < now();

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- Permissões: só roles internas podem chamar (não expor a anon/authenticated diretamente)
revoke all on function public.delete_expired_ephemeral_drafts() from public;
revoke all on function public.delete_expired_ephemeral_drafts() from anon;
revoke all on function public.delete_expired_ephemeral_drafts() from authenticated;
grant execute on function public.delete_expired_ephemeral_drafts() to service_role;

-- 5. (Opcional) Ativar pg_cron para limpeza automática a cada hora:
--    Requer extensão pg_cron habilitada no projeto Supabase.
--    Descomente as linhas abaixo se pg_cron estiver disponível:
--
-- select cron.schedule(
--   'delete-expired-ephemeral-drafts',
--   '0 * * * *',
--   'select public.delete_expired_ephemeral_drafts()'
-- );
