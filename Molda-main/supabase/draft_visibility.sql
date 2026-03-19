-- Migration: add is_public flag to project_drafts
-- Run this against your Supabase project once.

alter table public.project_drafts
  add column if not exists is_public boolean not null default false;

-- Allow owners to read/update their own drafts' visibility
-- (RLS policies below assume the table already has an owner-based policy;
--  if your project_drafts table has no RLS / existing policies cover this, skip.)

create index if not exists idx_project_drafts_is_public
  on public.project_drafts (user_id, is_public);
