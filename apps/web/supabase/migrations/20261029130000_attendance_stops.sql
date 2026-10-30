-- A student who cannot take a lesson (no sessions left, or on hold for payment) cannot be marked present or late
-- while hold_stops_classes is 1. The coach gets the reason. With 0, the lesson is marked as normal and operations is alerted.

create function public.attendance_block_reason_internal(p_session_id uuid, p_student_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sess_date date;
begin
  if public.setting_value('hold_stops_classes') <> 1 then
    return null;
  end if;
  -- A lesson already counted for this student is never blocked again.
  if exists (select 1 from public.session_deductions where session_id = p_session_id and student_id = p_student_id) then
    return null;
  end if;
  if public.payment_status(p_student_id) = 'on_hold' then
    return 'On hold for payment. Classes are stopped until the account is settled.';
  end if;

  select (starts_at at time zone 'Asia/Kuala_Lumpur')::date into sess_date
  from public.sessions where id = p_session_id;

  if exists (
    select 1 from public.package_pauses pp
    join public.student_packages sp on sp.id = pp.student_package_id
    where sp.student_id = p_student_id and pp.status = 'active' and sess_date between pp.starts_on and pp.ends_on
  ) then
    return null;
  end if;

  if exists (
    select 1 from public.student_packages sp
    where sp.student_id = p_student_id
      and sp.starts_on <= sess_date
      and sp.ends_on >= sess_date
      and sp.sessions_used < sp.sessions_total + sp.carried_in
  ) then
    return null;
  end if;
  return 'No sessions left in the package. The family needs to renew.';
end;
$$;

-- What the coach app asks before saving attendance. Only staff who may mark this lesson get an answer.
create function public.attendance_block_reason(p_session_id uuid, p_student_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_mark_session(p_session_id) then
    raise exception 'You cannot change this lesson.';
  end if;
  return public.attendance_block_reason_internal(p_session_id, p_student_id);
end;
$$;

-- The same rule enforced where the attendance is written, so no client can skip it.
create or replace function public.attendance_billing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sess public.sessions%rowtype;
  reason text;
begin
  if new.status in ('present', 'late') then
    reason := public.attendance_block_reason_internal(new.session_id, new.student_id);
    if reason is not null then
      raise exception '%', reason;
    end if;
  end if;

  select * into sess from public.sessions where id = new.session_id;

  if sess.status = 'cancelled' and new.status in ('present', 'late') then
    update public.sessions
    set status = 'done', cancel_kind = null, cancel_reason = null, coach_pay_rm = null
    where id = sess.id;

    perform public.notify_students(
      array(select mt.student_id from public.make_up_tokens mt where mt.source_session_id = sess.id and mt.status in ('open', 'booked')),
      sess.id,
      'The lesson went ahead after all, so the make-up token for it is cancelled.'
    );

    update public.make_up_tokens
    set status = 'void'
    where source_session_id = sess.id and status in ('open', 'booked');

    insert into public.operation_alerts (session_id, body)
    values (sess.id, 'Attendance was marked on a cancelled lesson. The cancellation was reversed, its make-up tokens voided, and any booked make-up lesson cancelled. Review the lesson.');
  end if;

  if new.status in ('present', 'late') or (new.status = 'absent' and not new.excused) then
    perform public.deduct_session(new.session_id, new.student_id, 'attendance');
  else
    perform public.reverse_deduction(new.session_id, new.student_id);
  end if;
  return new;
end;
$$;

revoke execute on function public.attendance_block_reason_internal(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.attendance_block_reason(uuid, uuid) from anon;
