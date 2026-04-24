-- Popularidade de fontes com janela móvel de 30 dias.
-- Conta aplicações reais de fonte e deixa o score cair automaticamente
-- conforme os buckets diários saem da janela de tendência.

create table if not exists public.font_popularity_daily (
  family text not null,
  usage_date date not null default timezone('utc', now())::date,
  usage_count integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint font_popularity_daily_pkey primary key (family, usage_date),
  constraint font_popularity_daily_usage_count_check check (usage_count >= 0)
);

create index if not exists font_popularity_daily_usage_date_idx
  on public.font_popularity_daily (usage_date desc);

alter table public.font_popularity_daily enable row level security;

drop policy if exists "font popularity daily is readable" on public.font_popularity_daily;
create policy "font popularity daily is readable"
  on public.font_popularity_daily
  for select
  using (true);

drop function if exists public.increment_font_popularity(text);
create or replace function public.increment_font_popularity(p_family text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family text := btrim(coalesce(p_family, ''));
  v_today date := timezone('utc', now())::date;
begin
  if v_family = '' then
    return;
  end if;

  insert into public.font_popularity_daily (family, usage_date, usage_count, updated_at)
  values (v_family, v_today, 1, timezone('utc', now()))
  on conflict (family, usage_date)
  do update set
    usage_count = public.font_popularity_daily.usage_count + 1,
    updated_at = timezone('utc', now());

  delete from public.font_popularity_daily
  where usage_date < (timezone('utc', now())::date - interval '29 days');
end;
$$;

grant execute on function public.increment_font_popularity(text) to anon, authenticated;

drop function if exists public.get_font_popularity_scores(text[]);
create or replace function public.get_font_popularity_scores(p_families text[] default null)
returns table (
  family text,
  score_30d bigint
)
language sql
security definer
set search_path = public
as $$
  select
    fpd.family,
    sum(fpd.usage_count)::bigint as score_30d
  from public.font_popularity_daily as fpd
  where fpd.usage_date >= (timezone('utc', now())::date - interval '29 days')
    and (p_families is null or fpd.family = any(p_families))
  group by fpd.family
  order by score_30d desc, fpd.family asc;
$$;

grant execute on function public.get_font_popularity_scores(text[]) to anon, authenticated;