-- Joining a class. A place is held for a limited time (a setting) until the first package is paid; then the place is kept.
alter table public.class_enrolments add column hold_until timestamptz;

insert into public.settings (key, value, label, unit) values
  ('class_hold_days', 3, 'How long a class place is held before the package is paid', 'days');

-- Only places that are kept or still held count toward the capacity.
create or replace function public.check_class_capacity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.class_enrolments
      where class_id = new.class_id and (hold_until is null or hold_until > now()))
     >= (select capacity from public.classes where id = new.class_id) then
    raise exception 'This class is full.';
  end if;
  return new;
end;
$$;

-- A paid student keeps its places. Its held places are confirmed.
create or replace function public.activate_student_on_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.students set status = 'active' where id = new.student_id and status in ('lead', 'trial');
  update public.class_enrolments set hold_until = null where student_id = new.student_id and hold_until is not null;
  return new;
end;
$$;

-- A visitor's public class list now shows how many are joined and the capacity.
drop function public.public_pool_classes(uuid);

create function public.public_pool_classes(p_pool_id uuid)
returns table (class_id uuid, name text, weekday integer, start_time time, duration_minutes integer, capacity integer, enrolled integer, coach_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.weekday, c.start_time, c.duration_minutes, c.capacity,
    (select count(*)::int from public.class_enrolments e where e.class_id = c.id and (e.hold_until is null or e.hold_until > now())),
    coalesce(nullif(trim(pr.full_name), ''), pr.username)
  from public.classes c
  left join public.profiles pr on pr.id = c.coach_id
  where c.pool_id = p_pool_id
    and c.is_active
    and c.end_date >= public.malaysia_today()
  order by c.weekday, c.start_time;
$$;

revoke execute on function public.public_pool_classes(uuid) from public;
grant execute on function public.public_pool_classes(uuid) to anon, authenticated;

-- A family or student joins a class for itself, or for one of its children. A student record at the pool is created or placed.
create function public.join_class(p_class_id uuid, p_student_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cls record;
  v_student uuid;
  v_pool uuid;
  profile_dob date;
  account_name text;
  paid boolean;
begin
  if auth.uid() is null or public.is_staff() then
    raise exception 'Only a family or student account can join a class.';
  end if;

  select c.id, c.pool_id, c.condo_id, c.weekday, c.start_time, c.duration_minutes, c.is_active, c.end_date
  into cls from public.classes c where c.id = p_class_id;
  if cls.id is null or not cls.is_active or cls.end_date < public.malaysia_today() or cls.pool_id is null then
    raise exception 'This class is not open for joining.';
  end if;

  if p_student_id is null then
    select s.id, s.pool_id into v_student, v_pool from public.students s where s.account_id = auth.uid() limit 1;
    if v_student is null then
      select pr.date_of_birth, coalesce(nullif(trim(pr.full_name), ''), pr.username, pr.email)
      into profile_dob, account_name from public.profiles pr where pr.id = auth.uid();
      if profile_dob is null then
        raise exception 'Your account has no date of birth.';
      end if;
      insert into public.students (full_name, date_of_birth, condo_id, pool_id, account_id)
      values (account_name, profile_dob, cls.condo_id, cls.pool_id, auth.uid())
      returning id into v_student;
      v_pool := cls.pool_id;
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

  if v_pool is null then
    update public.students set pool_id = cls.pool_id, condo_id = cls.condo_id where id = v_student;
    v_pool := cls.pool_id;
  end if;
  if v_pool <> cls.pool_id then
    raise exception 'This student is at another pool.';
  end if;

  delete from public.class_enrolments where class_id = cls.id and hold_until is not null and hold_until <= now();

  if exists (select 1 from public.class_enrolments where class_id = cls.id and student_id = v_student) then
    raise exception 'This student has already joined this class.';
  end if;

  if exists (
    select 1
    from public.class_enrolments e
    join public.classes c2 on c2.id = e.class_id
    where e.student_id = v_student
      and (e.hold_until is null or e.hold_until > now())
      and c2.weekday = cls.weekday
      and c2.end_date >= public.malaysia_today()
      and c2.start_time < cls.start_time + (cls.duration_minutes * interval '1 minute')
      and cls.start_time < c2.start_time + (c2.duration_minutes * interval '1 minute')
  ) then
    raise exception 'This class clashes with another class already joined.';
  end if;

  select exists (
    select 1 from public.student_packages sp where sp.student_id = v_student and sp.ends_on >= public.malaysia_today()
  ) into paid;

  insert into public.class_enrolments (class_id, student_id, hold_until)
  values (
    cls.id,
    v_student,
    case when paid then null else now() + make_interval(days => public.setting_value('class_hold_days')::int) end
  );
  return v_student;
end;
$$;

revoke execute on function public.join_class(uuid, uuid) from public, anon;
grant execute on function public.join_class(uuid, uuid) to authenticated;
