-- A class place is taken only after a package is paid at the pool. There is no held place any more.
delete from public.settings where key = 'class_hold_days';

create or replace function public.join_class(p_class_id uuid, p_student_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cls record;
  v_student uuid;
  v_pool uuid;
begin
  if auth.uid() is null or public.is_staff() then
    raise exception 'Only a family or student account can join a class.';
  end if;

  select c.id, c.pool_id, c.weekday, c.start_time, c.duration_minutes, c.is_active, c.end_date
  into cls from public.classes c where c.id = p_class_id;
  if cls.id is null or not cls.is_active or cls.end_date < public.malaysia_today() or cls.pool_id is null then
    raise exception 'This class is not open for joining.';
  end if;

  if p_student_id is null then
    select s.id, s.pool_id into v_student, v_pool from public.students s where s.account_id = auth.uid() limit 1;
    if v_student is null then
      raise exception 'Buy a package at this pool first.';
    end if;
  else
    if not exists (
      select 1 from public.students s
      join public.family_guardians fg on fg.family_id = s.family_id
      where s.id = p_student_id and fg.profile_id = auth.uid()
    ) then
      raise exception 'You can only join a class for your own children.';
    end if;
    select s.id, s.pool_id into v_student, v_pool from public.students s where s.id = p_student_id;
  end if;

  if v_pool is null or v_pool <> cls.pool_id then
    raise exception 'Buy a package at this pool first.';
  end if;

  -- The place is taken only when a package at this pool is paid and running.
  if not exists (
    select 1
    from public.student_packages sp
    join public.packages p on p.id = sp.package_id
    where sp.student_id = v_student
      and p.pool_id = cls.pool_id
      and sp.ends_on >= public.malaysia_today()
  ) then
    raise exception 'Buy a package at this pool first.';
  end if;

  if exists (select 1 from public.class_enrolments where class_id = cls.id and student_id = v_student) then
    raise exception 'This student has already joined this class.';
  end if;

  if exists (
    select 1
    from public.class_enrolments e
    join public.classes c2 on c2.id = e.class_id
    where e.student_id = v_student
      and c2.weekday = cls.weekday
      and c2.end_date >= public.malaysia_today()
      and c2.start_time < cls.start_time + (cls.duration_minutes * interval '1 minute')
      and cls.start_time < c2.start_time + (c2.duration_minutes * interval '1 minute')
  ) then
    raise exception 'This class clashes with another class already joined.';
  end if;

  insert into public.class_enrolments (class_id, student_id) values (cls.id, v_student);
  return v_student;
end;
$$;

revoke execute on function public.join_class(uuid, uuid) from public, anon;
grant execute on function public.join_class(uuid, uuid) to authenticated;
