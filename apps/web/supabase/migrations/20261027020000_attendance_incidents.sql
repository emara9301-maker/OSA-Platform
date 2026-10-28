-- Attendance for a lesson, and the incident log.
-- Attendance records only. Deducting sessions from a package is linked later, with billing (part 10).

create table public.attendance (
  session_id uuid not null references public.sessions (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  status text not null check (status in ('present', 'late', 'absent')),
  reason text,
  marked_by uuid references public.profiles (id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (session_id, student_id),
  constraint attendance_absent_reason check (status <> 'absent' or (reason is not null and length(trim(reason)) > 0))
);

-- Only students enrolled in the class can be marked.
create function public.check_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.sessions s
    join public.class_enrolments ce on ce.class_id = s.class_id
    where s.id = new.session_id and ce.student_id = new.student_id
  ) then
    raise exception 'This student is not enrolled in this class.';
  end if;

  new.marked_by := auth.uid();
  new.marked_at := now();
  return new;
end;
$$;

create trigger attendance_prepare
  before insert or update on public.attendance
  for each row execute function public.check_attendance();

create trigger attendance_audit
  after insert or update or delete on public.attendance
  for each row execute function public.write_audit_log();

-- Who may mark a session: managers and the coach of its class.
create function public.can_mark_session(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_account_role() in ('owner', 'department_head'), false)
    or exists (
      select 1 from public.sessions s
      join public.classes c on c.id = s.class_id
      where s.id = sid and c.coach_id = auth.uid()
    );
$$;

alter table public.attendance enable row level security;
revoke all on public.attendance from anon;
revoke delete on public.attendance from authenticated;

create policy "see attendance" on public.attendance for select to authenticated
  using (public.can_see_class((select class_id from public.sessions where id = session_id)));
create policy "mark attendance" on public.attendance for insert to authenticated
  with check (public.can_mark_session(session_id));
create policy "change attendance" on public.attendance for update to authenticated
  using (public.can_mark_session(session_id))
  with check (public.can_mark_session(session_id));

-- Incident log: injuries, near-drowning, behaviour, pool hazards.
create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  condo_id uuid not null references public.condos (id),
  student_id uuid references public.students (id) on delete set null,
  reported_by uuid references public.profiles (id) on delete set null,
  occurred_at timestamptz not null default now(),
  incident_type text not null check (incident_type in ('injury', 'near_drowning', 'behaviour', 'pool_hazard', 'other')),
  severity text not null check (severity in ('low', 'medium', 'high')),
  description text not null check (length(trim(description)) > 0),
  informed_who text,
  informed_channel text check (informed_channel in ('whatsapp', 'email', 'phone', 'none')),
  informed_at timestamptz,
  follow_up text,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

create function public.prepare_incident()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.reported_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger incidents_prepare
  before insert on public.incidents
  for each row execute function public.prepare_incident();

create trigger incidents_audit
  after insert or update on public.incidents
  for each row execute function public.write_audit_log();

alter table public.incidents enable row level security;
revoke all on public.incidents from anon;
revoke delete on public.incidents from authenticated;

-- Managers see every incident; staff see the ones they reported.
create policy "managers and reporter read incidents" on public.incidents for select to authenticated
  using (
    coalesce(public.current_account_role() in ('owner', 'department_head'), false)
    or reported_by = auth.uid()
  );
create policy "staff report incidents" on public.incidents for insert to authenticated
  with check (public.is_staff());
create policy "managers update incidents" on public.incidents for update to authenticated
  using (public.current_account_role() in ('owner', 'department_head'))
  with check (public.current_account_role() in ('owner', 'department_head'));
