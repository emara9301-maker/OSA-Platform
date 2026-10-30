-- Part 11: client portal for parents and adult students.
-- A family can pay its own invoices and book make-up lessons for its children. Managers keep every power they had.

-- Recording a payment is split out. Managers record payments by hand; the portal's payment goes through the server,
-- which checks the family can see the invoice, charges the gateway, and calls apply_payment with the server key.
create function public.apply_payment(p_invoice_id uuid, p_gateway text, p_gateway_ref text, p_recorded_by uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invoices%rowtype;
  pkg public.packages%rowtype;
  starts date;
  carried integer := 0;
  new_id uuid;
begin
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found.';
  end if;
  if inv.status <> 'unpaid' then
    raise exception 'This invoice is not waiting for payment.';
  end if;
  select * into pkg from public.packages where id = inv.package_id;

  insert into public.payments (invoice_id, amount, gateway, gateway_ref, recorded_by)
  values (inv.id, inv.amount, p_gateway, p_gateway_ref, p_recorded_by);
  update public.invoices set status = 'paid', paid_at = now() where id = inv.id;

  starts := greatest(
    public.malaysia_today(),
    coalesce((select max(ends_on) + 1 from public.student_packages where student_id = inv.student_id), public.malaysia_today())
  );

  if inv.carry_over then
    select coalesce(sum(sessions_total + carried_in - sessions_used), 0) into carried
    from public.student_packages
    where student_id = inv.student_id and not carried_out and ends_on < starts;
  end if;
  update public.student_packages
  set carried_out = true
  where student_id = inv.student_id and not carried_out and ends_on < starts;

  insert into public.student_packages (student_id, package_id, invoice_id, starts_on, ends_on, sessions_total, carried_in)
  values (inv.student_id, pkg.id, inv.id, starts, starts + pkg.validity_days - 1, pkg.sessions_count, carried)
  returning id into new_id;

  perform public.notify_students(
    array[inv.student_id],
    null,
    format('Payment of RM %s received. %s starts on %s.', inv.amount, pkg.name, to_char(starts, 'DD Mon YYYY'))
  );
  return new_id;
end;
$$;

create or replace function public.record_payment(p_invoice_id uuid, p_gateway text, p_gateway_ref text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_account_role() not in ('owner', 'department_head') then
    raise exception 'Only managers can record payments.';
  end if;
  return public.apply_payment(p_invoice_id, p_gateway, p_gateway_ref, auth.uid());
end;
$$;

-- Booking a make-up. Managers may book any make-up and approve a clash. A family may book make-ups for its own
-- children, within the same rules, but cannot approve a clash.
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
  new_id uuid;
begin
  if public.current_account_role() not in ('owner', 'department_head') then
    if p_ops_approved or exists (
      select 1 from public.make_up_tokens t where t.id = any(p_token_ids) and not public.can_see_billing(t.student_id)
    ) then
      raise exception 'You cannot book this make-up lesson.';
    end if;
  end if;

  select * into c from public.classes where id = p_class_id;
  if not found then
    raise exception 'Class not found.';
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

-- What the booking screen needs to suggest times for a class: its pool hours, its length, and the coach's busy times.
-- Only for a family with an open make-up token in that class. It exposes no other student or lesson details.
create function public.make_up_schedule_context(p_class_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (
    select 1 from public.make_up_tokens t
    where t.class_id = p_class_id and t.status = 'open' and public.can_see_billing(t.student_id)
  ) then (
    select jsonb_build_object(
      'pool_hours', co.pool_hours,
      'duration_minutes', cl.duration_minutes,
      'busy', coalesce((
        select jsonb_agg(jsonb_build_object('start', s.starts_at, 'end', s.ends_at))
        from public.sessions s
        join public.classes oc on oc.id = s.class_id
        where oc.coach_id = cl.coach_id
          and s.status in ('scheduled', 'paused')
          and s.ends_at > now()
          and s.starts_at < now() + interval '14 days'
      ), '[]'::jsonb)
    )
    from public.classes cl
    join public.condos co on co.id = cl.condo_id
    where cl.id = p_class_id
  ) end;
$$;

revoke execute on function public.apply_payment(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.apply_payment(uuid, text, text, uuid) to service_role;
revoke execute on function public.schedule_make_up(uuid, timestamptz, uuid[], boolean) from anon;
revoke execute on function public.make_up_schedule_context(uuid) from anon;
