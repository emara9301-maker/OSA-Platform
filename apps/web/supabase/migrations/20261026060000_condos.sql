-- Condos: the centre of everything. A condo is "ready" once its required details are filled in.
create type public.condo_status as enum ('draft', 'ready');

create table public.condos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area text,
  address text,
  latitude double precision,
  longitude double precision,
  pool_hours text,
  rules text,
  access_notes text,
  contact_phone text,
  status public.condo_status not null default 'draft',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sets the status from the required details, and records who created the condo.
-- Runs on the server, so a client cannot force a status or a creator.
create function public.prepare_condo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;

  new.updated_at := now();
  new.status := case
    when nullif(trim(new.name), '') is not null
      and nullif(trim(new.address), '') is not null
      and nullif(trim(new.pool_hours), '') is not null
      and nullif(trim(new.contact_phone), '') is not null
    then 'ready'
    else 'draft'
  end;
  return new;
end;
$$;

create trigger condos_prepare
  before insert or update on public.condos
  for each row execute function public.prepare_condo();

create trigger condos_audit
  after insert or update or delete on public.condos
  for each row execute function public.write_audit_log();

-- Staff (anyone who is not a student) can read condos.
create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_account_role() <> 'student', false);
$$;

alter table public.condos enable row level security;
revoke all on public.condos from anon;
revoke delete on public.condos from authenticated;

create policy "staff read condos"
  on public.condos for select
  to authenticated
  using (public.is_staff());

create policy "owner and coaches add condos"
  on public.condos for insert
  to authenticated
  with check (public.current_account_role() in ('owner', 'coach'));

create policy "owner and coaches edit condos"
  on public.condos for update
  to authenticated
  using (public.current_account_role() in ('owner', 'coach'))
  with check (public.current_account_role() in ('owner', 'coach'));
