-- Families and students.
-- Owner and department heads add and edit families and students. A coach sees only the students
-- staff assigned to them. A guardian sees every child in their family. An adult student sees their own record.

-- The audit trigger also finds the record for tables keyed by family_id or student_id.
create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (actor_id, action, table_name, record_id, before_data, after_data)
  values (
    auth.uid(),
    lower(TG_OP),
    TG_TABLE_NAME,
    coalesce(
      to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'key',
      to_jsonb(new) ->> 'student_id', to_jsonb(new) ->> 'family_id',
      to_jsonb(old) ->> 'id', to_jsonb(old) ->> 'key',
      to_jsonb(old) ->> 'student_id', to_jsonb(old) ->> 'family_id'
    ),
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.family_guardians (
  family_id uuid not null references public.families (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  relationship text not null check (length(trim(relationship)) > 0),
  created_at timestamptz not null default now(),
  primary key (family_id, profile_id)
);

create type public.student_status as enum ('lead', 'trial', 'active', 'paused', 'left');

create table public.students (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families (id) on delete set null,
  account_id uuid unique references public.profiles (id) on delete set null,
  full_name text not null check (length(trim(full_name)) > 0),
  nickname text,
  date_of_birth date not null,
  language text,
  condo_id uuid not null references public.condos (id),
  status public.student_status not null default 'lead',
  start_level text,
  current_level text,
  start_date date,
  medical_notes text,
  allergies text,
  emergency_contact_name text,
  emergency_contact_phone text,
  photo_consent boolean not null default false,
  data_consent boolean not null default false,
  consents_accepted_at timestamptz,
  qr_token uuid not null unique default gen_random_uuid(),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.student_coaches (
  student_id uuid not null references public.students (id) on delete cascade,
  coach_id uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (student_id, coach_id)
);

create function public.prepare_family()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create function public.prepare_student()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger families_prepare
  before insert or update on public.families
  for each row execute function public.prepare_family();

create trigger students_prepare
  before insert or update on public.students
  for each row execute function public.prepare_student();

create trigger families_audit
  after insert or update or delete on public.families
  for each row execute function public.write_audit_log();

create trigger family_guardians_audit
  after insert or delete on public.family_guardians
  for each row execute function public.write_audit_log();

create trigger students_audit
  after insert or update on public.students
  for each row execute function public.write_audit_log();

create trigger student_coaches_audit
  after insert or delete on public.student_coaches
  for each row execute function public.write_audit_log();

-- Decides whether the current user may see one student.
create function public.can_see_student(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_account_role() in ('owner', 'department_head')
    or exists (
      select 1 from public.student_coaches sc
      where sc.student_id = sid and sc.coach_id = auth.uid()
    )
    or exists (
      select 1 from public.students s
      join public.family_guardians fg on fg.family_id = s.family_id
      where s.id = sid and fg.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.students s
      where s.id = sid and s.account_id = auth.uid()
    );
$$;

create function public.can_see_family(fid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_account_role() in ('owner', 'department_head')
    or exists (
      select 1 from public.family_guardians fg
      where fg.family_id = fid and fg.profile_id = auth.uid()
    );
$$;

alter table public.families enable row level security;
alter table public.family_guardians enable row level security;
alter table public.students enable row level security;
alter table public.student_coaches enable row level security;

revoke all on public.families, public.family_guardians, public.students, public.student_coaches from anon;
revoke delete on public.families, public.students from authenticated;

create policy "see families" on public.families for select to authenticated
  using (public.can_see_family(id));
create policy "managers add families" on public.families for insert to authenticated
  with check (public.current_account_role() in ('owner', 'department_head'));
create policy "managers edit families" on public.families for update to authenticated
  using (public.current_account_role() in ('owner', 'department_head'))
  with check (public.current_account_role() in ('owner', 'department_head'));

create policy "see guardian links" on public.family_guardians for select to authenticated
  using (public.current_account_role() in ('owner', 'department_head') or profile_id = auth.uid());
create policy "managers add guardian links" on public.family_guardians for insert to authenticated
  with check (public.current_account_role() in ('owner', 'department_head'));
create policy "managers remove guardian links" on public.family_guardians for delete to authenticated
  using (public.current_account_role() in ('owner', 'department_head'));

create policy "see students" on public.students for select to authenticated
  using (public.can_see_student(id));
create policy "managers add students" on public.students for insert to authenticated
  with check (public.current_account_role() in ('owner', 'department_head'));
create policy "managers edit students" on public.students for update to authenticated
  using (public.current_account_role() in ('owner', 'department_head'))
  with check (public.current_account_role() in ('owner', 'department_head'));

create policy "see coach assignments" on public.student_coaches for select to authenticated
  using (public.current_account_role() in ('owner', 'department_head') or coach_id = auth.uid());
create policy "managers assign coaches" on public.student_coaches for insert to authenticated
  with check (public.current_account_role() in ('owner', 'department_head'));
create policy "managers unassign coaches" on public.student_coaches for delete to authenticated
  using (public.current_account_role() in ('owner', 'department_head'));
