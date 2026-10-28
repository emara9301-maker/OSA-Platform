-- Daily coach reports, skills per level, and moving a student to the next level.
-- The coach decides the level move; no head coach approval is needed.

-- The audit trigger also finds the record for tables keyed by report_id.
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
      to_jsonb(new) ->> 'student_id', to_jsonb(new) ->> 'family_id', to_jsonb(new) ->> 'report_id',
      to_jsonb(old) ->> 'id', to_jsonb(old) ->> 'key',
      to_jsonb(old) ->> 'student_id', to_jsonb(old) ->> 'family_id', to_jsonb(old) ->> 'report_id'
    ),
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

-- Provisional skills per level. Staff can edit them later.
create table public.skills (
  id uuid primary key default gen_random_uuid(),
  level_id uuid not null references public.levels (id),
  name text not null check (length(trim(name)) > 0),
  sort_order integer not null,
  is_active boolean not null default true,
  unique (level_id, name)
);

insert into public.skills (level_id, name, sort_order)
select l.id, s.name, s.sort_order
from public.levels l
join (values
  ('Water Confidence', 'Face in the water', 1),
  ('Water Confidence', 'Blow bubbles', 2),
  ('Water Confidence', 'Float with support', 3),
  ('Water Confidence', 'Kick holding the wall', 4),
  ('Beginner 1', 'Front float', 1),
  ('Beginner 1', 'Back float', 2),
  ('Beginner 1', 'Kick with a board', 3),
  ('Beginner 1', 'Glide', 4),
  ('Beginner 2', 'Freestyle arm pull', 1),
  ('Beginner 2', 'Freestyle breathing', 2),
  ('Beginner 2', 'Backstroke kick', 3),
  ('Beginner 2', 'Safe entry and exit', 4),
  ('Intermediate 1', 'Full freestyle', 1),
  ('Intermediate 1', 'Full backstroke', 2),
  ('Intermediate 1', 'Breaststroke kick', 3),
  ('Intermediate 1', 'Turns', 4),
  ('Intermediate 2', 'Full breaststroke', 1),
  ('Intermediate 2', 'Butterfly kick', 2),
  ('Intermediate 2', 'Dive start', 3),
  ('Intermediate 2', 'Endurance 25 m', 4),
  ('Advanced', 'Freestyle 50 m', 1),
  ('Advanced', 'Backstroke 50 m', 2),
  ('Advanced', 'Breaststroke 50 m', 3),
  ('Advanced', 'Survival float 5 minutes', 4)
) as s(level_name, name, sort_order) on s.level_name = l.name;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  coach_id uuid references public.profiles (id) on delete set null,
  attitude integer check (attitude between 1 and 5),
  effort integer check (effort between 1 and 5),
  water_confidence integer check (water_confidence between 1 and 5),
  improvements text,
  problems text[] not null default '{}' check (problems <@ array['fear', 'behaviour', 'health', 'missing_gear', 'late']::text[]),
  note_to_parent text,
  next_focus_skill_id uuid references public.skills (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, student_id)
);

create table public.report_skills (
  report_id uuid not null references public.reports (id) on delete cascade,
  skill_id uuid not null references public.skills (id),
  progress_percent integer not null check (progress_percent between 0 and 100),
  primary key (report_id, skill_id)
);

-- Internal notes for OSA. Never shown to parents.
create table public.report_internal_notes (
  report_id uuid primary key references public.reports (id) on delete cascade,
  note text not null,
  updated_at timestamptz not null default now()
);

create function public.session_of_report(rid uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select session_id from public.reports where id = rid;
$$;

create function public.can_see_report(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.reports r
    where r.id = rid
      and (public.can_see_class((select s.class_id from public.sessions s where s.id = r.session_id))
           or public.can_see_student(r.student_id))
  );
$$;

create function public.prepare_report()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.coach_id := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger reports_prepare
  before insert or update on public.reports
  for each row execute function public.prepare_report();

create trigger reports_audit
  after insert or update on public.reports
  for each row execute function public.write_audit_log();

create trigger report_skills_audit
  after insert or update or delete on public.report_skills
  for each row execute function public.write_audit_log();

create trigger report_internal_notes_audit
  after insert or update on public.report_internal_notes
  for each row execute function public.write_audit_log();

-- The coach of the class moves a student to a level. Managers can do it too.
create function public.move_student_level(p_session uuid, p_student uuid, p_level_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  level_name text;
begin
  if not public.can_mark_session(p_session) then
    raise exception 'You cannot change the level for this lesson.';
  end if;
  if not exists (
    select 1 from public.sessions s
    join public.class_enrolments ce on ce.class_id = s.class_id
    where s.id = p_session and ce.student_id = p_student
  ) then
    raise exception 'This student is not enrolled in this class.';
  end if;

  select name into level_name from public.levels where id = p_level_id;
  update public.students set current_level = level_name where id = p_student;
end;
$$;

revoke all on function public.move_student_level(uuid, uuid, uuid) from public, anon;
grant execute on function public.move_student_level(uuid, uuid, uuid) to authenticated;

alter table public.skills enable row level security;
alter table public.reports enable row level security;
alter table public.report_skills enable row level security;
alter table public.report_internal_notes enable row level security;

revoke all on public.skills, public.reports, public.report_skills, public.report_internal_notes from anon;
revoke delete on public.skills, public.reports, public.report_internal_notes from authenticated;

create policy "staff read skills" on public.skills for select to authenticated
  using (public.is_staff());
create policy "managers write skills" on public.skills for all to authenticated
  using (public.current_account_role() in ('owner', 'department_head'))
  with check (public.current_account_role() in ('owner', 'department_head'));

create policy "see reports" on public.reports for select to authenticated
  using (public.can_see_report(id));
create policy "coach writes report" on public.reports for insert to authenticated
  with check (public.can_mark_session(session_id));
create policy "coach edits report" on public.reports for update to authenticated
  using (public.can_mark_session(session_id))
  with check (public.can_mark_session(session_id));

create policy "see report skills" on public.report_skills for select to authenticated
  using (public.can_see_report(report_id));
create policy "coach writes report skills" on public.report_skills for insert to authenticated
  with check (public.can_mark_session(public.session_of_report(report_id)));
create policy "coach changes report skills" on public.report_skills for delete to authenticated
  using (public.can_mark_session(public.session_of_report(report_id)));

-- Internal notes: only the coach of the class and managers.
create policy "staff read internal notes" on public.report_internal_notes for select to authenticated
  using (public.can_mark_session(public.session_of_report(report_id)));
create policy "staff write internal notes" on public.report_internal_notes for insert to authenticated
  with check (public.can_mark_session(public.session_of_report(report_id)));
create policy "staff edit internal notes" on public.report_internal_notes for update to authenticated
  using (public.can_mark_session(public.session_of_report(report_id)))
  with check (public.can_mark_session(public.session_of_report(report_id)));
