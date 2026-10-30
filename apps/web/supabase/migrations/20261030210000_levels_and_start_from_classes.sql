-- The level and the start date come from the classes. The start level is the level of the first class the student joins (paid).
-- The current level starts there. The start date is the day of the first lesson the student attended.
create function public.set_levels_on_enrolment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  class_level text;
begin
  select l.name into class_level
  from public.classes c join public.levels l on l.id = c.level_id
  where c.id = new.class_id;

  update public.students
  set start_level = coalesce(start_level, class_level),
      current_level = coalesce(current_level, coalesce(start_level, class_level))
  where id = new.student_id;
  return new;
end;
$$;

create trigger class_enrolments_set_levels
  after insert on public.class_enrolments
  for each row execute function public.set_levels_on_enrolment();

create function public.set_start_date_on_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lesson_day date;
begin
  if new.status not in ('present', 'late') then
    return new;
  end if;
  select (se.starts_at at time zone 'Asia/Kuala_Lumpur')::date into lesson_day
  from public.sessions se where se.id = new.session_id;

  update public.students
  set start_date = lesson_day
  where id = new.student_id and (start_date is null or start_date > lesson_day);
  return new;
end;
$$;

create trigger attendance_set_start_date
  after insert or update of status on public.attendance
  for each row execute function public.set_start_date_on_attendance();

-- Existing students: fill the same values from their classes and attendance.
update public.students s
set start_level = sub.name
from (
  select distinct on (e.student_id) e.student_id, l.name
  from public.class_enrolments e
  join public.classes c on c.id = e.class_id
  join public.levels l on l.id = c.level_id
  order by e.student_id, e.created_at
) sub
where s.id = sub.student_id and s.start_level is null;

update public.students set current_level = start_level where current_level is null and start_level is not null;

update public.students s
set start_date = sub.lesson_day
from (
  select a.student_id, min((se.starts_at at time zone 'Asia/Kuala_Lumpur')::date) as lesson_day
  from public.attendance a join public.sessions se on se.id = a.session_id
  where a.status in ('present', 'late')
  group by a.student_id
) sub
where s.id = sub.student_id and s.start_date is null;
