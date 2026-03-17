-- Seed incremental de usuários de teste (Supabase Auth + profiles)
-- Pode ser executado múltiplas vezes sem duplicar contas (idempotente por email).
--
-- MOTIVO do bloco DO $$:
--   CTEs com DML (INSERT) no PostgreSQL rodam no mesmo snapshot e não enxergam
--   dados inseridos por CTEs irmãs no mesmo statement. O bloco procedural garante
--   execução sequencial: auth.users já existe quando public.profiles é inserida.
--
-- Execute no SQL Editor do Supabase (requer privilégios de projeto / service_role).

create extension if not exists pgcrypto;

do $$
declare
  v_uid      uuid;
  v_email    text;
  v_inserted int := 0;
  v_skipped  int := 0;
  u          record;
begin
  for u in
    select
      t.username,
      t.nickname,
      lower(t.email)     as email,
      t.pass,
      t.phone,
      t.birth_date::date as birth_date,
      t.cpf
    from (values
      ('ana.souza.teste',         'Ana Souza',         'ana.souza.teste@molda.dev',         'Teste@12345', '11990010001', '1996-03-15', '11111111101'),
      ('bruno.lima.teste',        'Bruno Lima',        'bruno.lima.teste@molda.dev',        'Teste@12345', '11990010002', '1992-09-21', '11111111102'),
      ('camila.rocha.teste',      'Camila Rocha',      'camila.rocha.teste@molda.dev',      'Teste@12345', '21990010003', '1998-11-02', '11111111103'),
      ('diego.alves.teste',       'Diego Alves',       'diego.alves.teste@molda.dev',       'Teste@12345', '31990010004', '1994-01-30', '11111111104'),
      ('elisa.nunes.teste',       'Elisa Nunes',       'elisa.nunes.teste@molda.dev',       'Teste@12345', '41990010005', '1997-06-18', '11111111105'),
      ('felipe.gomes.teste',      'Felipe Gomes',      'felipe.gomes.teste@molda.dev',      'Teste@12345', '51990010006', '1991-12-09', '11111111106'),
      ('gabriela.oliveira.teste', 'Gabriela Oliveira', 'gabriela.oliveira.teste@molda.dev', 'Teste@12345', '61990010007', '2000-04-25', '11111111107'),
      ('henrique.santos.teste',   'Henrique Santos',   'henrique.santos.teste@molda.dev',   'Teste@12345', '71990010008', '1993-08-13', '11111111108'),
      ('isabela.moura.teste',     'Isabela Moura',     'isabela.moura.teste@molda.dev',     'Teste@12345', '81990010009', '1999-02-27', '11111111109'),
      ('joao.pedro.teste',        'João Pedro',        'joao.pedro.teste@molda.dev',        'Teste@12345', '91990010010', '1995-10-05', '11111111110'),
      ('karina.castro.teste',     'Karina Castro',     'karina.castro.teste@molda.dev',     'Teste@12345', '11990010011', '1990-07-17', '11111111111'),
      ('lucas.melo.teste',        'Lucas Melo',        'lucas.melo.teste@molda.dev',        'Teste@12345', '21990010012', '1998-05-11', '11111111112'),
      ('mariana.farias.teste',    'Mariana Farias',    'mariana.farias.teste@molda.dev',    'Teste@12345', '31990010013', '1996-12-01', '11111111113'),
      ('nicolas.teixeira.teste',  'Nicolas Teixeira',  'nicolas.teixeira.teste@molda.dev',  'Teste@12345', '41990010014', '2001-03-22', '11111111114'),
      ('paula.araujo.teste',      'Paula Araújo',      'paula.araujo.teste@molda.dev',      'Teste@12345', '51990010015', '1997-09-14', '11111111115')
    ) as t(username, nickname, email, pass, phone, birth_date, cpf)
  loop
    v_email := u.email;

    -- 1. Verifica se o usuário já existe em auth.users
    select id into v_uid
    from auth.users
    where lower(email) = v_email
    limit 1;

    if v_uid is null then
      -- 2a. Cria entrada em auth.users (agora visível para os passos seguintes)
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
        jsonb_build_object(
          'nickname',   u.nickname,
          'username',   u.username,
          'phone',      u.phone,
          'birth_date', u.birth_date,
          'cpf',        u.cpf
        ),
        now(),
        now()
      );

      -- 2b. Cria identidade email (necessário para login funcionar)
      insert into auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
      ) values (
        gen_random_uuid(),
        v_uid,
        jsonb_build_object('sub', v_uid::text, 'email', v_email),
        'email',
        v_email,
        now(),
        now(),
        now()
      )
      on conflict do nothing;

      v_inserted := v_inserted + 1;
    else
      v_skipped := v_skipped + 1;
    end if;

    -- 3. Upsert em public.profiles
    --    Neste ponto v_uid já existe em auth.users (inserido ou recuperado acima),
    --    então a FK é respeitada e o perfil é criado/atualizado corretamente.
    insert into public.profiles (
      id,
      nickname,
      username,
      email,
      phone,
      birth_date,
      cpf,
      role,
      created_at,
      updated_at
    ) values (
      v_uid,
      u.nickname,
      u.username,
      v_email,
      u.phone,
      u.birth_date,
      u.cpf,
      'viewer',
      now(),
      now()
    )
    on conflict (id) do update set
      nickname   = excluded.nickname,
      username   = excluded.username,
      email      = excluded.email,
      phone      = excluded.phone,
      birth_date = excluded.birth_date,
      cpf        = excluded.cpf,
      updated_at = now();

  end loop;

  raise notice 'Seed concluído: % usuário(s) criado(s) no auth, % já existia(m). Profiles atualizados para todos.',
    v_inserted, v_skipped;
end;
$$;
