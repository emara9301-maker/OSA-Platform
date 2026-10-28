-- Part 1: staff accounts and roles. Staff rows are created by OSA (service role) only.
create type public.staff_role as enum (
  'owner',
  'department_head',
  'sales',
  'operations',
  'finance',
  'head_coach',
  'coach'
);

create table public.staff (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role public.staff_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.staff enable row level security;

-- Clients cannot write staff rows. Only the service role (server side) can.
revoke insert, update, delete on public.staff from anon, authenticated;

-- Looks up the caller's role without re-entering RLS (avoids policy recursion).
create or replace function public.current_staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.staff where id = auth.uid() and is_active;
$$;

create policy "staff can read own row"
  on public.staff for select
  to authenticated
  using (id = auth.uid());

create policy "owner can read all staff"
  on public.staff for select
  to authenticated
  using (public.current_staff_role() = 'owner');
