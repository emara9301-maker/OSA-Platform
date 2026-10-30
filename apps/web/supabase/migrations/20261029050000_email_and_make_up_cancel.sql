-- Messages go by email for now. WhatsApp comes back at the end of the project, when its provider is connected.
-- The mock sender records each email in outbound_messages.
alter table public.outbound_messages drop constraint outbound_messages_channel_check;
alter table public.outbound_messages add constraint outbound_messages_channel_check
  check (channel in ('email', 'whatsapp'));
alter table public.outbound_messages alter column channel set default 'email';

-- A lesson that turns out to have gone ahead (attendance marked on a cancelled lesson):
-- its open make-up tokens are voided, and any make-up lesson already booked from it is cancelled. Families are told both.
create or replace function public.attendance_billing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sess public.sessions%rowtype;
  booked_make_up record;
begin
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

    for booked_make_up in
      select distinct mt.make_up_session_id as id
      from public.make_up_tokens mt
      where mt.source_session_id = sess.id and mt.status = 'booked' and mt.make_up_session_id is not null
    loop
      perform public.notify_students(
        array(select mt.student_id from public.make_up_tokens mt where mt.make_up_session_id = booked_make_up.id and mt.source_session_id = sess.id),
        booked_make_up.id,
        'Make-up lesson cancelled: the original lesson went ahead.'
      );
      update public.sessions
      set status = 'cancelled', cancel_reason = 'The original lesson went ahead'
      where id = booked_make_up.id and status = 'scheduled';
    end loop;

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
