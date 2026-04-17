-- Confirma todos os usuários de teste (@molda.dev) que estão em auth.users
-- mas ainda não têm email_confirmed_at / confirmed_at preenchidos.
--
-- Execute no SQL Editor do Supabase (requer service_role).
-- Seguro para rodar múltiplas vezes.

update auth.users
set
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  updated_at         = now()
where
  email ilike '%@molda.dev'
  and email_confirmed_at is null;

-- Retorna resumo dos usuários de teste e status atual
select
  email,
  email_confirmed_at is not null as email_confirmed,
  created_at
from auth.users
where email ilike '%@molda.dev'
order by created_at;
