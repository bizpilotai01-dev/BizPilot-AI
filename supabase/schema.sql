create table if not exists businesses (
  id text primary key,
  name text not null,
  industry text,
  owner_id text,
  created_at timestamptz default now()
);

create table if not exists profiles (
  id text primary key,
  full_name text,
  email text unique not null,
  business_id text references businesses(id),
  role text default 'owner',
  avatar_path text,
  phone text,
  reminder_email_enabled boolean not null default false,
  reminder_whatsapp_enabled boolean not null default false,
  created_at timestamptz default now()
);

alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists reminder_email_enabled boolean not null default false;
alter table public.profiles add column if not exists reminder_whatsapp_enabled boolean not null default false;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists leads (
  id text primary key,
  business_id text references businesses(id),
  name text not null,
  company text,
  email text,
  phone text,
  status text not null default 'new',
  value numeric default 0,
  owner text,
  next_action text,
  last_contacted_at timestamptz,
  tags text[] default '{}',
  photo_path text,
  created_at timestamptz default now()
);

alter table public.leads add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lead-photos', 'lead-photos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists notes (
  id text primary key,
  lead_id text references leads(id) on delete cascade,
  content text not null,
  created_by text references profiles(id),
  created_at timestamptz default now()
);

create table if not exists tasks (
  id text primary key,
  lead_id text references leads(id) on delete cascade,
  title text not null,
  due_date date,
  status text default 'pending',
  created_at timestamptz default now()
);

create table if not exists activities (
  id text primary key,
  business_id text not null references businesses(id) on delete cascade,
  lead_id text references leads(id) on delete set null,
  actor_id text,
  actor_name text not null,
  description text not null,
  created_at timestamptz default now()
);

create table if not exists reminder_deliveries (
  id text primary key default gen_random_uuid()::text,
  profile_id text not null references profiles(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp')),
  reminder_date date not null,
  status text not null default 'processing' check (status in ('processing', 'sent', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  unique (profile_id, channel, reminder_date)
);

alter table public.reminder_deliveries enable row level security;

create index if not exists leads_business_id_idx on leads (business_id);
create index if not exists leads_status_idx on leads (status);
create index if not exists tasks_due_date_idx on tasks (due_date);
create index if not exists activities_business_created_idx on activities (business_id, created_at desc);

create or replace function public.bizpilot_user_business_ids()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select profiles.business_id
  from public.profiles
  where profiles.id = (select auth.uid())::text
    and profiles.business_id is not null;
$$;

revoke all on function public.bizpilot_user_business_ids() from public;
grant execute on function public.bizpilot_user_business_ids() to authenticated;

alter table public.businesses enable row level security;
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.notes enable row level security;
alter table public.tasks enable row level security;
alter table public.activities enable row level security;

drop policy if exists "bizpilot_businesses_select_member" on public.businesses;
create policy "bizpilot_businesses_select_member"
  on public.businesses for select to authenticated
  using (id in (select public.bizpilot_user_business_ids()));

drop policy if exists "bizpilot_profiles_select_workspace" on public.profiles;
create policy "bizpilot_profiles_select_workspace"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())::text
    or business_id in (select public.bizpilot_user_business_ids())
  );

drop policy if exists "bizpilot_leads_workspace_access" on public.leads;
create policy "bizpilot_leads_workspace_access"
  on public.leads for all to authenticated
  using (business_id in (select public.bizpilot_user_business_ids()))
  with check (business_id in (select public.bizpilot_user_business_ids()));

drop policy if exists "bizpilot_notes_workspace_access" on public.notes;
create policy "bizpilot_notes_workspace_access"
  on public.notes for all to authenticated
  using (
    exists (
      select 1
      from public.leads
      where leads.id = notes.lead_id
        and leads.business_id in (select public.bizpilot_user_business_ids())
    )
  )
  with check (
    exists (
      select 1
      from public.leads
      where leads.id = notes.lead_id
        and leads.business_id in (select public.bizpilot_user_business_ids())
    )
  );

drop policy if exists "bizpilot_tasks_workspace_access" on public.tasks;
create policy "bizpilot_tasks_workspace_access"
  on public.tasks for all to authenticated
  using (
    exists (
      select 1
      from public.leads
      where leads.id = tasks.lead_id
        and leads.business_id in (select public.bizpilot_user_business_ids())
    )
  )
  with check (
    exists (
      select 1
      from public.leads
      where leads.id = tasks.lead_id
        and leads.business_id in (select public.bizpilot_user_business_ids())
    )
  );

drop policy if exists "bizpilot_activities_workspace_access" on public.activities;
create policy "bizpilot_activities_workspace_access"
  on public.activities for all to authenticated
  using (business_id in (select public.bizpilot_user_business_ids()))
  with check (business_id in (select public.bizpilot_user_business_ids()));

do $$
declare
  protected_tables text[] := array['businesses', 'profiles', 'leads', 'notes', 'tasks', 'activities', 'reminder_deliveries'];
  table_name text;
begin
  foreach table_name in array protected_tables loop
    if not exists (
      select 1
      from pg_class
      join pg_namespace on pg_namespace.oid = pg_class.relnamespace
      where pg_namespace.nspname = 'public'
        and pg_class.relname = table_name
        and pg_class.relrowsecurity
    ) then
      raise exception 'RLS is not enabled on public.%', table_name;
    end if;
  end loop;

  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'bizpilot_businesses_select_member')
    or not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'bizpilot_profiles_select_workspace')
    or not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'bizpilot_leads_workspace_access')
    or not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'bizpilot_notes_workspace_access')
    or not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'bizpilot_tasks_workspace_access')
    or not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'bizpilot_activities_workspace_access') then
    raise exception 'One or more BizPilot workspace RLS policies are missing.';
  end if;
end;
$$;
