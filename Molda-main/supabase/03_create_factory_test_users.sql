-- 3. Criar usuários de teste da fábrica (Factory Users)
-- Execute no SQL Editor do Supabase APÓS executar o scripts 01 e 02

create extension if not exists pgcrypto;

do $$
declare
  v_uid uuid;
  v_email text;
  v_inserted int := 0;
  v_skipped int := 0;
  u record;
begin
  raise notice 'Iniciando criação de usuários factory...';
  
  -- Inserir usuários de fábrica
  for u in
    select
      t.username,
      t.name,
      lower(t.email) as email,
      t.pass,
      t.phone,
      t.role
    from (values
      ('tecnico.01.fabrica',  'Técnico Production 01',  'tecnico.01@molda.factory',  'Fabrica@12345', '11999000001', 'factory'),
      ('tecnico.02.fabrica',  'Técnico Production 02',  'tecnico.02@molda.factory',  'Fabrica@12345', '11999000002', 'factory'),
      ('gerente.fabrica',     'Gerente de Produção',    'gerente@molda.factory',     'Fabrica@12345', '11999000003', 'factory'),
      ('supervisor.qualidade','Supervisor Qualidade',   'supervisor.qualidade@molda.factory', 'Fabrica@12345', '11999000004', 'factory')
    ) as t(username, name, email, pass, phone, role)
  loop
    v_email := u.email;
    
    -- 1. Verifica se o usuário já existe em auth.users
    select id into v_uid
    from auth.users
    where lower(email) = v_email
    limit 1;
    
    if v_uid is null then
      -- 2. Cria entrada em auth.users
      v_uid := gen_random_uuid();
      
      insert into auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
      ) values (
        v_uid,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        v_email,
        crypt(u.pass, gen_salt('bf')),
        now(),
        jsonb_build_object('provider', 'email', 'providers', array['email']),
        jsonb_build_object('username', u.username),
        now(),
        now()
      );
      
      -- 3. Cria / atualiza perfil em public.profiles
      insert into public.profiles (
        id,
        username,
        nickname,
        role,
        phone,
        email,
        created_at
      ) values (
        v_uid,
        u.username,
        u.name,
        u.role, -- 'factory'
        u.phone,
        v_email,
        now()
      )
      on conflict (id) do update
      set
        nickname = u.name,
        role = u.role,
        phone = u.phone;
      
      v_inserted := v_inserted + 1;
      raise notice 'Usuário criado: % (%) - Role: %', u.name, v_email, u.role;
    else
      v_skipped := v_skipped + 1;
      raise notice 'Usuário já existe: % (%) - Pulado', u.name, v_email;
    end if;
  end loop;
  
  raise notice 'Resumo: % criados, % pulados', v_inserted, v_skipped;
end $$;

-- ============================================
-- Verificar que os usuários foram criados
-- ============================================
select 
  p.id,
  p.username,
  p.nickname,
  p.role,
  p.phone,
  p.created_at
from public.profiles p
where p.role = 'factory'
order by p.created_at desc;
