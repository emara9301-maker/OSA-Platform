-- Two decisions made adjustable in Settings.
-- hold_stops_classes: a family on hold takes no sessions and cannot book make-ups (1), or classes keep running and ops is alerted (0).
-- coach_propose_make_up: a coach may book a make-up time for a lesson they teach (1), or only managers may (0).
insert into public.settings (key, value, label, unit) values
  ('hold_stops_classes', 1, 'Stop classes for families on hold (1 = yes, 0 = keep classes running and alert operations)', 'yes/no'),
  ('coach_propose_make_up', 1, 'Coaches may book a make-up time for their lessons (1 = yes, 0 = managers only)', 'yes/no');

create or replace function public.staff_setting(p_key text)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Only staff can read this setting.';
  end if;
  if p_key not in (
    'schedule_window_days', 'student_history_days', 'missing_report_days',
    'make_up_search_days', 'make_up_suggestion_count', 'make_up_slot_step_minutes',
    'make_up_min_notice_hours', 'rain_hold_minutes', 'coach_propose_make_up', 'hold_stops_classes'
  ) then
    raise exception 'This setting is not available to staff.';
  end if;
  return public.setting_value(p_key);
end;
$$;

-- A family on hold: classes stop (or keep running with an alert), and nothing is deducted for a lesson it attends while on hold.
create or replace function public.deduct_session(p_session_id uuid, p_student_id uuid, p_source text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sess_date date;
  sp public.student_packages%rowtype;
  student_name text;
begin
  if exists (
    select 1 from public.session_deductions where session_id = p_session_id and student_id = p_student_id
  ) then
    return;
  end if;

  select (starts_at at time zone 'Asia/Kuala_Lumpur')::date into sess_date
  from public.sessions where id = p_session_id;

  if exists (
    select 1
    from public.package_pauses pp
    join public.student_packages s2 on s2.id = pp.student_package_id
    where s2.student_id = p_student_id and pp.status = 'active' and sess_date between pp.starts_on and pp.ends_on
  ) then
    return;
  end if;

  if public.payment_status(p_student_id) = 'on_hold' then
    select full_name into student_name from public.students where id = p_student_id;
    insert into public.operation_alerts (session_id, body)
    values (p_session_id, format('%s is on hold for payment. ', student_name) ||
      case when public.setting_value('hold_stops_classes') = 1
        then 'The lesson was not deducted.'
        else 'Classes keep running, so the lesson was deducted as normal.' end);
    if public.setting_value('hold_stops_classes') = 1 then
      return;
    end if;
  end if;

  select * into sp
  from public.student_packages
  where student_id = p_student_id
    and starts_on <= sess_date
    and ends_on >= sess_date
    and sessions_used < sessions_total + carried_in
  order by ends_on, starts_on
  limit 1
  for update;

  if not found then
    select full_name into student_name from public.students where id = p_student_id;
    insert into public.operation_alerts (session_id, body)
    values (p_session_id, format('No session left in a package for %s. Nothing was deducted.', student_name));
    return;
  end if;

  insert into public.session_deductions (session_id, student_id, student_package_id, source)
  values (p_session_id, p_student_id, sp.id, p_source);
  update public.student_packages set sessions_used = sessions_used + 1 where id = sp.id;
end;
$$;

-- Booking a make-up. Managers may book any make-up and approve a clash. A coach may book for their own lesson
-- when the setting allows it. A family may book for its own children. Nobody but a manager approves a clash,
-- and a family on hold cannot book while the hold stops classes.
create or replace function public.schedule_make_up(
  p_class_id uuid,
  p_starts_at timestamptz,
  p_token_ids uuid[],
  p_ops_approved boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.classes%rowtype;
  ends timestamptz;
  token_count integer;
  coach_clash boolean;
  managers boolean := public.current_account_role() in ('owner', 'department_head');
  coach_of_class boolean;
  new_id uuid;
begin
  select * into c from public.classes where id = p_class_id;
  if not found then
    raise exception 'Class not found.';
  end if;

  coach_of_class := public.current_account_role() = 'coach'
    and public.setting_value('coach_propose_make_up') = 1
    and c.coach_id = auth.uid();

  if not managers then
    if p_ops_approved then
      raise exception 'You cannot book this make-up lesson.';
    end if;
    if not coach_of_class and exists (
      select 1 from public.make_up_tokens t where t.id = any(p_token_ids) and not public.can_see_billing(t.student_id)
    ) then
      raise exception 'You cannot book this make-up lesson.';
    end if;
  end if;

  if public.setting_value('hold_stops_classes') = 1 and exists (
    select 1 from public.make_up_tokens t
    where t.id = any(p_token_ids) and public.payment_status(t.student_id) = 'on_hold'
  ) then
    raise exception 'This family is on hold, so a make-up lesson cannot be booked.';
  end if;

  if p_starts_at < now() + make_interval(hours => public.setting_value('make_up_min_notice_hours')::int) then
    raise exception '%', format(
      'A make-up lesson needs at least %s hours notice.', public.setting_value('make_up_min_notice_hours')::int
    );
  end if;

  select count(*) into token_count
  from public.make_up_tokens
  where id = any(p_token_ids) and class_id = p_class_id and status = 'open' and expires_at > now();
  if token_count = 0 or token_count <> cardinality(p_token_ids) then
    raise exception 'Some make-up tokens are not open for this class.';
  end if;
  if token_count > c.capacity then
    raise exception 'More students than the class capacity.';
  end if;

  if exists (select 1 from public.sessions where class_id = c.id and starts_at = p_starts_at) then
    raise exception 'This class already has a lesson at this time.';
  end if;

  ends := p_starts_at + make_interval(mins => c.duration_minutes);
  select exists (
    select 1
    from public.sessions s
    join public.classes oc on oc.id = s.class_id
    where oc.coach_id = c.coach_id
      and s.status in ('scheduled', 'paused')
      and s.starts_at < ends
      and s.ends_at > p_starts_at
  ) into coach_clash;
  if coach_clash and not p_ops_approved then
    raise exception 'The coach has another lesson at this time. Operations must approve the make-up.';
  end if;

  insert into public.sessions (class_id, starts_at, ends_at, is_make_up, ops_approved)
  values (c.id, p_starts_at, ends, true, coach_clash)
  returning id into new_id;

  update public.make_up_tokens
  set status = 'booked', make_up_session_id = new_id
  where id = any(p_token_ids);

  perform public.notify_students(
    array(select mt.student_id from public.make_up_tokens mt where mt.make_up_session_id = new_id),
    new_id,
    format(
      'Make-up lesson booked for %s.',
      to_char(p_starts_at at time zone 'Asia/Kuala_Lumpur', 'DD Mon YYYY, HH24:MI')
    )
  );
  return new_id;
end;
$$;
