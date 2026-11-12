-- Minimal owner-isolated workspace for the optional authenticated beta.
-- Run once in the target Supabase project. Never put service-role keys in the app.
create table if not exists public.terrawise_workspaces (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  plans jsonb not null default '{}'::jsonb check (jsonb_typeof(plans) = 'object'),
  preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object'),
  analyses jsonb not null default '[]'::jsonb check (jsonb_typeof(analyses) = 'array'),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

alter table public.terrawise_workspaces enable row level security;
revoke all on public.terrawise_workspaces from anon;
grant select, insert, update, delete on public.terrawise_workspaces to authenticated;

drop policy if exists "workspace_select_owner" on public.terrawise_workspaces;
create policy "workspace_select_owner" on public.terrawise_workspaces for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "workspace_insert_owner" on public.terrawise_workspaces;
create policy "workspace_insert_owner" on public.terrawise_workspaces for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "workspace_update_owner" on public.terrawise_workspaces;
create policy "workspace_update_owner" on public.terrawise_workspaces for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "workspace_delete_owner" on public.terrawise_workspaces;
create policy "workspace_delete_owner" on public.terrawise_workspaces for delete to authenticated using ((select auth.uid()) = owner_id);

-- Soil-report files remain browser-local until a private, owner-scoped Storage
-- implementation and explicit cloud upload consent are configured. This table
-- does not create a public bucket and contains no secret credentials.
