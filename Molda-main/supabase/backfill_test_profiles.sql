-- Backfill robusto de perfis de teste a partir de auth.users
-- Compatível com variações de schema da tabela public.profiles.
--
-- Uso:
-- 1) Execute este arquivo no SQL Editor do Supabase.
-- 2) Ele cria/atualiza profiles para todos emails %@molda.dev.
-- 3) No final retorna resumo e lista de perfis criados/atualizados.

create extension if not exists pgcrypto;

do $$
declare
  r record;
  v_sql text;
  v_cols text[] := array['id'];
  v_vals text[] := array['$1'];
  v_updates text[] := array[]::text[];
  v_has_role boolean;
  v_count int := 0;
begin
  -- Detecta colunas opcionais de public.profiles e monta SQL dinamicamente.
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='nickname') then
    v_cols := array_append(v_cols, 'nickname');
    v_vals := array_append(v_vals, '$2');
    v_updates := array_append(v_updates, 'nickname = excluded.nickname');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='username') then
    v_cols := array_append(v_cols, 'username');
    v_vals := array_append(v_vals, '$3');
    v_updates := array_append(v_updates, 'username = excluded.username');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='email') then
    v_cols := array_append(v_cols, 'email');
    v_vals := array_append(v_vals, '$4');
    v_updates := array_append(v_updates, 'email = excluded.email');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='phone') then
    v_cols := array_append(v_cols, 'phone');
    v_vals := array_append(v_vals, '$5');
    v_updates := array_append(v_updates, 'phone = excluded.phone');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='birth_date') then
    v_cols := array_append(v_cols, 'birth_date');
    v_vals := array_append(v_vals, '$6');
    v_updates := array_append(v_updates, 'birth_date = excluded.birth_date');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='cpf') then
    v_cols := array_append(v_cols, 'cpf');
    v_vals := array_append(v_vals, '$7');
    v_updates := array_append(v_updates, 'cpf = excluded.cpf');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='avatar_path') then
    v_cols := array_append(v_cols, 'avatar_path');
    v_vals := array_append(v_vals, '$8');
    v_updates := array_append(v_updates, 'avatar_path = excluded.avatar_path');
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='role'
  ) into v_has_role;

  if v_has_role then
    v_cols := array_append(v_cols, 'role');
    v_vals := array_append(v_vals, '$9');
    v_updates := array_append(v_updates, 'role = excluded.role');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='updated_at') then
    v_updates := array_append(v_updates, 'updated_at = now()');
    v_cols := array_append(v_cols, 'updated_at');
    v_vals := array_append(v_vals, 'now()');
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='created_at') then
    v_cols := array_append(v_cols, 'created_at');
    v_vals := array_append(v_vals, 'now()');
  end if;

  v_sql := format(
    'insert into public.profiles (%s) values (%s) on conflict (id) do update set %s',
    array_to_string(v_cols, ', '),
    array_to_string(v_vals, ', '),
    case
      when coalesce(array_length(v_updates, 1), 0) = 0 then 'id = excluded.id'
      else array_to_string(v_updates, ', ')
    end
  );

  for r in
    select
      u.id,
      lower(u.email) as email,
      coalesce(u.raw_user_meta_data ->> 'nickname', split_part(u.email, '@', 1)) as nickname,
      coalesce(u.raw_user_meta_data ->> 'username', replace(split_part(u.email, '@', 1), ' ', '.')) as username,
      nullif(u.raw_user_meta_data ->> 'phone', '') as phone,
      nullif(u.raw_user_meta_data ->> 'birth_date', '')::date as birth_date,
      nullif(u.raw_user_meta_data ->> 'cpf', '') as cpf,
      nullif(u.raw_user_meta_data ->> 'avatar_path', '') as avatar_path
    from auth.users u
    where u.email ilike '%@molda.dev'
  loop
    execute v_sql
      using
        r.id,
        r.nickname,
        r.username,
        r.email,
        r.phone,
        r.birth_date,
        r.cpf,
        r.avatar_path,
        case when v_has_role then 'viewer' else null end;

    v_count := v_count + 1;
  end loop;

  raise notice 'Backfill concluido. % perfil(is) processado(s).', v_count;
end;
$$;

-- Diagnostico rapido
select
  (select count(*) from auth.users where email ilike '%@molda.dev') as auth_test_users,
  (
    select count(*)
    from public.profiles p
    where p.id in (
      select u.id
      from auth.users u
      where u.email ilike '%@molda.dev'
    )
  ) as profile_test_users;

select
  u.id,
  u.email,
  (p.id is not null) as has_profile
from auth.users u
left join public.profiles p on p.id = u.id
where u.email ilike '%@molda.dev'
order by u.email;
