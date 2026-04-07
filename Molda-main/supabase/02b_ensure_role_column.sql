-- 02b. SCRIPT CORRETIVO: Garantir que coluna 'role' existe em profiles
-- Execute esse script ANTES do script 02 se receber erro sobre coluna role não existir

-- Verificar estrutura atual de profiles
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'profiles' ORDER BY ordinal_position;

-- Adicionar coluna role se não existir
alter table public.profiles
add column if not exists role text default 'viewer';

-- Verificar resultado
select column_name, data_type, column_default 
from information_schema.columns 
where table_name = 'profiles' 
order by ordinal_position;
