-- Classes, weekly sessions, enrolments and levels.
-- A class repeats every week on one weekday, from its start date to its end date.
-- Each occurrence is a session row, which can be cancelled on its own.

create table public.levels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  sort_order integer not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.levels (name, sort_order) values
  ('Water Confidence', 1),
  ('Beginner 1', 2),
  ('Beginner 2', 3),
  ('Intermediate 1', 4),
  ('Intermediate 2', 5),
  ('Advanced', 6);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  condo_id uuid not null references public.condos (id),
  coach_id uuid not null references public.profiles (id),
  level_id uuid not null references public.levels (id),
  class_type text not null default 'group' check (class_type in ('private', 'group')),
  weekday integer not null check (weekday between 1 and 7),
  start_time time not null,
  duration_minutes integer not null check (duration_minutes > 0),
  capacity integer not null check (capacity > 0),
  start_date date not null,
  end_date date not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classes_dates check (end_date >= start_date)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'done')),
  cancel_reason text,
  unique (class_id, starts_at)
);

create table public.class_enrolments (
  class_id uuid not null references public.classes (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

-- Creates one session for every matching weekday between the start and end dates, in Malaysian time.
create function public.generate_sessions(p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.classes%rowtype;
begin
  select * into c from public.classes where id = p_class_id;

  insert into public.sessions (class_id, starts_at, ends_at)
  select
    c.id,
    (d + c.start_time) at time zone 'Asia/Kuala_Lumpur',
    ((d + c.start_time) at time zone 'Asia/Kuala_Lumpur') + make_interval(mins => c.duration_minutes)
  from generate_series(c.start_date, c.end_date, interval '1 day') as d
  where extract(isodow from d) = c.weekday
  on conflict (class_id, starts_at) do nothing;
end;
$$;

create function public.classes_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function public.classes_generate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- Future scheduled sessions follow the new timetable. Cancelled and finished sessions are kept.
    delete from public.sessions
    where class_id = new.id and status = 'scheduled' and starts_at > now();
  end if;
  perform public.generate_sessions(new.id);
  return new;
end;
$$;

create trigger classes_prepare
  before insert or update on public.classes
  for each row execute function public.classes_after_write();

create trigger classes_generate_sessions
  after insert or update of weekday, start_time, duration_minutes, start_date, end_date on public.classes
  for each row execute function public.classes_generate();

-- A class cannot take more students than its capacity.
create function public.check_class_capacity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.class_enrolments where class_id = new.class_id)
     >= (select capacity from public.classes where id = new.class_id) then
    raise exception 'This class is full.';
  end if;
  return new;
end;
$$;

create trigger class_enrolments_capacity
  before insert on public.class_enrolments
  for each row execute function public.check_class_capacity();

-- Audit trail for the schedule.
create trigger levels_audit
  after insert or update on public.levels
  for each row execute function public.write_audit_log();

create trigger classes_audit
  after insert or update on public.classes
  for each row execute function public.write_audit_log();

create trigger sessions_audit
  after update on public.sessions
  for each row execute function public.write_audit_log();

create trigger class_enrolments_audit
  after insert or delete on public.class_enrolments
  for each row execute function public.write_audit_log();

-- Who may see a class: managers, its coach, and anyone enrolled in it through a student they can see.
create function public.can_see_class(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_account_role() in ('owner', 'department_head'), false)
    or exists (select 1 from public.classes c where c.id = cid and c.coach_id = auth.uid());
$$;

-- A coach sees a student who is enrolled in one of their classes, even without a direct assignment.
create or replace function public.can_see_student(sid uuid)
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
      select 1 from public.class_enrolments ce
      join public.classes c on c.id = ce.class_id
      where ce.student_id = sid and c.coach_id = auth.uid()
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

alter table public.levels enable row level security;
alter table public.classes enable row level security;
alter table public.sessions enable row level security;
alter table public.class_enrolments enable row level security;

revoke all on public.levels, public.classes, public.sessions, public.class_enrolments from anon;
revoke delete on public.levels, public.classes, public.sessions from authenticated;
revoke insert on public.sessions from authenticated;

create policy "staff read levels" on public.levels for select to authenticated
  using (public.is_staff());
create policy "managers add levels" on public.levels for insert to authenticated
  with check (public.current_account_role() in ('owner', 'department_head'));
create policy "managers edit levels" on public.levels for update to authenticated
  using (public.current_account_role() in ('owner', 'department_head'))
  with check (public.current_account_role() in ('owner', 'department_head'));

create policy "see classes" on public.classes for select to authenticated
  using (public.can_see_class(id));
create policy "managers add classes" on public.classes for insert to authenticated
  with check (public.current_account_role() in ('owner', 'department_head'));
create policy "managers edit classes" on public.classes for update to authenticated
  using (public.current_account_role() in ('owner', 'department_head'))
  with check (public.current_account_role() in ('owner', 'department_head'));

create policy "see sessions" on public.sessions for select to authenticated
  using (public.can_see_class(class_id));
create policy "managers cancel sessions" on public.sessions for update to authenticated
  using (public.current_account_role() in ('owner', 'department_head'))
  with check (public.current_account_role() in ('owner', 'department_head'));

create policy "see enrolments" on public.class_enrolments for select to authenticated
  using (public.can_see_class(class_id) or public.can_see_student(student_id));
create policy "managers enrol students" on public.class_enrolments for insert to authenticated
  with check (public.current_account_role() in ('owner', 'department_head'));
create policy "managers remove enrolments" on public.class_enrolments for delete to authenticated
  using (public.current_account_role() in ('owner', 'department_head'));
