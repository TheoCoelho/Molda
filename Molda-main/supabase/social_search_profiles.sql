-- Busca social de perfis (compatível com RLS restritivo em profiles)
-- Execute no SQL Editor do Supabase.

create or replace function public.count_public_project_drafts(
  target_user_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  has_is_public boolean;
  result_count int;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_drafts'
      and column_name = 'is_public'
  ) into has_is_public;

  if has_is_public then
    execute $sql$
      select count(*)::int
      from public.project_drafts pd
      where pd.user_id = $1
        and coalesce(pd.is_public, coalesce((pd.data->>'isPublic')::boolean, false)) = true
    $sql$
    into result_count
    using target_user_id;
  else
    execute $sql$
      select count(*)::int
      from public.project_drafts pd
      where pd.user_id = $1
        and coalesce((pd.data->>'isPublic')::boolean, false) = true
    $sql$
    into result_count
    using target_user_id;
  end if;

  return coalesce(result_count, 0);
end;
$$;

revoke all on function public.count_public_project_drafts(uuid) from public;
grant execute on function public.count_public_project_drafts(uuid) to anon;
grant execute on function public.count_public_project_drafts(uuid) to authenticated;

create or replace function public.search_social_profiles(
  search_term text default null,
  limit_count int default 80
)
returns table (
  id uuid,
  username text,
  nickname text,
  avatar_path text,
  designs_count int,
  pieces_count int
)
language sql
security definer
set search_path = public
as $$
  with params as (
    select
      nullif(trim(search_term), '') as term,
      greatest(1, least(coalesce(limit_count, 80), 200)) as lim
  )
  select
    p.id,
    p.username,
    coalesce(p.nickname, '') as nickname,
    p.avatar_path,
    coalesce(g.designs_count, 0)::int as designs_count,
    coalesce(d.pieces_count, 0)::int as pieces_count
  from public.profiles p
  cross join params
  left join lateral (
    select count(*) as designs_count
    from public.gallery_visibility gv
    where gv.user_id = p.id
      and gv.is_public = true
  ) g on true
  left join lateral (
    select public.count_public_project_drafts(p.id) as pieces_count
  ) d on true
  where p.username is not null
    and (auth.uid() is null or p.id <> auth.uid())
    and (
      params.term is null
      or p.username ilike ('%' || params.term || '%')
      or coalesce(p.nickname, '') ilike ('%' || params.term || '%')
    )
  order by p.username asc
  limit (select lim from params);
$$;

revoke all on function public.search_social_profiles(text, int) from public;
grant execute on function public.search_social_profiles(text, int) to anon;
grant execute on function public.search_social_profiles(text, int) to authenticated;

create or replace function public.get_social_profile(
  target_user_id uuid
)
returns table (
  id uuid,
  username text,
  nickname text,
  avatar_path text,
  designs_count int,
  pieces_count int
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    coalesce(p.nickname, '') as nickname,
    p.avatar_path,
    coalesce(g.designs_count, 0)::int as designs_count,
    coalesce(d.pieces_count, 0)::int as pieces_count
  from public.profiles p
  left join lateral (
    select count(*) as designs_count
    from public.gallery_visibility gv
    where gv.user_id = p.id
      and gv.is_public = true
  ) g on true
  left join lateral (
    select public.count_public_project_drafts(p.id) as pieces_count
  ) d on true
  where p.id = target_user_id
    and p.username is not null
  limit 1;
$$;

revoke all on function public.get_social_profile(uuid) from public;
grant execute on function public.get_social_profile(uuid) to anon;
grant execute on function public.get_social_profile(uuid) to authenticated;

create or replace function public.get_public_gallery_items(
  target_user_id uuid,
  limit_count int default 100
)
returns table (
  storage_path text,
  is_public boolean,
  design_value numeric,
  design_name text,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    gv.storage_path,
    gv.is_public,
    gv.design_value,
    gv.design_name,
    gv.updated_at
  from public.gallery_visibility gv
  where gv.user_id = target_user_id
    and gv.is_public = true
  order by gv.updated_at desc nulls last
  limit greatest(1, least(coalesce(limit_count, 100), 300));
$$;

revoke all on function public.get_public_gallery_items(uuid, int) from public;
grant execute on function public.get_public_gallery_items(uuid, int) to anon;
grant execute on function public.get_public_gallery_items(uuid, int) to authenticated;

create or replace function public.get_public_project_drafts(
  target_user_id uuid,
  limit_count int default 100
)
returns table (
  id uuid,
  project_key text,
  data jsonb,
  updated_at timestamptz,
  is_public boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  has_is_public boolean;
  safe_limit int;
begin
  safe_limit := greatest(1, least(coalesce(limit_count, 100), 300));

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_drafts'
      and column_name = 'is_public'
  ) into has_is_public;

  if has_is_public then
    return query execute $sql$
      select
        pd.id,
        pd.project_key,
        pd.data,
        pd.updated_at,
        coalesce(pd.is_public, coalesce((pd.data->>'isPublic')::boolean, false)) as is_public
      from public.project_drafts pd
      where pd.user_id = $1
        and coalesce(pd.is_public, coalesce((pd.data->>'isPublic')::boolean, false)) = true
      order by pd.updated_at desc nulls last
      limit $2
    $sql$
    using target_user_id, safe_limit;
  else
    return query execute $sql$
      select
        pd.id,
        pd.project_key,
        pd.data,
        pd.updated_at,
        coalesce((pd.data->>'isPublic')::boolean, false) as is_public
      from public.project_drafts pd
      where pd.user_id = $1
        and coalesce((pd.data->>'isPublic')::boolean, false) = true
      order by pd.updated_at desc nulls last
      limit $2
    $sql$
    using target_user_id, safe_limit;
  end if;
end;
$$;

revoke all on function public.get_public_project_drafts(uuid, int) from public;
grant execute on function public.get_public_project_drafts(uuid, int) to anon;
grant execute on function public.get_public_project_drafts(uuid, int) to authenticated;
