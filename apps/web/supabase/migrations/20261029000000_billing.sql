-- Part 10: billing and payments (mock gateway).
-- Each child has their own invoices and packages. A paid invoice starts a package period (30 days by default).
-- Attendance deducts one session from that package. Money and attendance rules run here, on the server.

alter table public.make_up_tokens drop constraint make_up_tokens_status_check;
alter table public.make_up_tokens add constraint make_up_tokens_status_check
  check (status in ('open', 'booked', 'used', 'void'));

-- An absence is deducted unless the coach marks it excused.
alter table public.attendance add column excused boolean not null default false;

create function public.malaysia_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Kuala_Lumpur')::date;
$$;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  package_id uuid not null references public.packages (id),
  kind text not null check (kind in ('new', 'renewal')),
  amount numeric(10, 2) not null check (amount >= 0),
  discount_percent numeric(5, 2) not null default 0 check (discount_percent between 0 and 100),
  carry_over boolean not null default true,
  due_on date not null,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid', 'void')),
  reminder_sent_at timestamptz,
  paid_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  amount numeric(10, 2) not null check (amount >= 0),
  gateway text not null check (gateway in ('mock')),
  gateway_ref text not null check (length(trim(gateway_ref)) > 0),
  paid_at timestamptz not null default now(),
  recorded_by uuid references public.profiles (id) on delete set null
);

-- One row per 30-day period. Sessions carried in from earlier periods are counted separately.
create table public.student_packages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  package_id uuid not null references public.packages (id),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  sessions_total integer not null check (sessions_total >= 0),
  carried_in integer not null default 0 check (carried_in >= 0),
  sessions_used integer not null default 0 check (sessions_used >= 0),
  carried_out boolean not null default false,
  created_at timestamptz not null default now(),
  constraint student_packages_dates check (ends_on >= starts_on),
  constraint student_packages_used check (sessions_used <= sessions_total + carried_in)
);

-- Which session each deduction came from. A rain-counted lesson is deducted once per student.
create table public.session_deductions (
  session_id uuid not null references public.sessions (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  student_package_id uuid not null references public.student_packages (id) on delete cascade,
  source text not null check (source in ('attendance', 'rain')),
  created_at timestamptz not null default now(),
  primary key (session_id, student_id)
);

-- Manager allows a family more time before its classes go on hold.
create table public.payment_grace (
  student_id uuid primary key references public.students (id) on delete cascade,
  until date not null,
  set_by uuid references public.profiles (id) on delete set null,
  set_at timestamptz not null default now()
);

-- Things operations must look at: attendance on a cancelled lesson, or a deduction with no package left.
create table public.operation_alerts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions (id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);

-- Who may see a family's billing: managers, its guardians, and an adult student on their own record.
create function public.can_see_billing(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_account_role() in ('owner', 'department_head')
    or exists (
      select 1 from public.students s
      join public.family_guardians fg on fg.family_id = s.family_id
      where s.id = sid and fg.profile_id = auth.uid()
    )
    or exists (select 1 from public.students s where s.id = sid and s.account_id = auth.uid());
$$;

-- Creates an invoice for a package. A child whose sibling has a running package gets the sibling discount.
create function public.make_invoice(
  p_student_id uuid,
  p_package_id uuid,
  p_carry_over boolean,
  p_due_on date,
  p_kind text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pkg public.packages%rowtype;
  stu public.students%rowtype;
  discount numeric := 0;
  new_id uuid;
begin
  select * into pkg from public.packages where id = p_package_id and is_active;
  if not found then
    raise exception 'Package not found.';
  end if;
  if pkg.price is null then
    raise exception 'This package has no price yet.';
  end if;
  select * into stu from public.students where id = p_student_id;
  if not found then
    raise exception 'Student not found.';
  end if;

  if stu.family_id is not null and exists (
    select 1
    from public.students sib
    join public.student_packages sp on sp.student_id = sib.id
    where sib.family_id = stu.family_id
      and sib.id <> stu.id
      and sp.starts_on <= public.malaysia_today()
      and sp.ends_on >= public.malaysia_today()
  ) then
    discount := public.setting_value('sibling_discount_percent');
  end if;

  insert into public.invoices (student_id, package_id, kind, amount, discount_percent, carry_over, due_on)
  values (stu.id, pkg.id, p_kind, round(pkg.price * (100 - discount) / 100, 2), discount, p_carry_over, p_due_on)
  returning id into new_id;

  perform public.notify_students(
    array[stu.id],
    null,
    format('Invoice for %s, due %s.', pkg.name, to_char(p_due_on, 'DD Mon YYYY'))
  );
  return new_id;
end;
$$;

create function public.create_invoice(p_student_id uuid, p_package_id uuid, p_carry_over boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_account_role() not in ('owner', 'department_head') then
    raise exception 'Only managers can create invoices.';
  end if;
  return public.make_invoice(
    p_student_id,
    p_package_id,
    p_carry_over,
    public.malaysia_today(),
    case when exists (select 1 from public.student_packages where student_id = p_student_id) then 'renewal' else 'new' end
  );
end;
$$;

-- Records a payment and starts the package period. The period begins after the last one, or today.
-- Unused sessions from earlier periods carry over when the invoice allows it, and are not used twice.
create function public.record_payment(p_invoice_id uuid, p_gateway text, p_gateway_ref text)
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
  if public.current_account_role() not in ('owner', 'department_head') then
    raise exception 'Only managers can record payments.';
  end if;
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found.';
  end if;
  if inv.status <> 'unpaid' then
    raise exception 'This invoice is not waiting for payment.';
  end if;
  select * into pkg from public.packages where id = inv.package_id;

  insert into public.payments (invoice_id, amount, gateway, gateway_ref, recorded_by)
  values (inv.id, inv.amount, p_gateway, p_gateway_ref, auth.uid());
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

-- Takes one session from the period that covers the lesson's date, earliest end first. Runs once per student per lesson.
create function public.deduct_session(p_session_id uuid, p_student_id uuid, p_source text)
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

-- Gives back an attendance deduction. A rain deduction is never reversed by attendance.
create function public.reverse_deduction(p_session_id uuid, p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.session_deductions%rowtype;
begin
  select * into d
  from public.session_deductions
  where session_id = p_session_id and student_id = p_student_id and source = 'attendance';
  if not found then
    return;
  end if;

  delete from public.session_deductions where session_id = d.session_id and student_id = d.student_id;
  update public.student_packages set sessions_used = sessions_used - 1 where id = d.student_package_id;
end;
$$;

-- Attendance decides deductions. Present and late are attended. An absence is deducted unless it is excused.
-- Attendance on a cancelled lesson means the coach was right: the cancellation is reversed and tokens are voided.
create function public.attendance_billing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sess public.sessions%rowtype;
begin
  select * into sess from public.sessions where id = new.session_id;

  if sess.status = 'cancelled' and new.status in ('present', 'late') then
    update public.sessions
    set status = 'done', cancel_kind = null, cancel_reason = null, coach_pay_rm = null
    where id = sess.id;
    update public.make_up_tokens set status = 'void' where source_session_id = sess.id and status in ('open', 'booked');
    insert into public.operation_alerts (session_id, body)
    values (sess.id, 'Attendance was marked on a cancelled lesson. The cancellation was reversed and make-up tokens voided. Review the lesson.');
  end if;

  if new.status in ('present', 'late') or (new.status = 'absent' and not new.excused) then
    perform public.deduct_session(new.session_id, new.student_id, 'attendance');
  else
    perform public.reverse_deduction(new.session_id, new.student_id);
  end if;
  return new;
end;
$$;

create trigger attendance_billing
  after insert or update on public.attendance
  for each row execute function public.attendance_billing();

-- A lesson stopped for rain that counts as a session deducts every enrolled student.
-- Replaces the part 9 function, which only ended the lesson.
create or replace function public.close_session(p_session_id uuid, p_kind text, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sessions%rowtype;
  c public.classes%rowtype;
  taught numeric;
  student_ids uuid[];
  sid uuid;
  expires timestamptz;
begin
  select * into s from public.sessions where id = p_session_id for update;
  select * into c from public.classes where id = s.class_id;
  if s.status not in ('scheduled', 'paused') then
    raise exception 'This lesson is already finished or cancelled.';
  end if;

  taught := s.taught_minutes;
  if s.status = 'scheduled' and now() > coalesce(s.segment_started_at, s.starts_at) then
    taught := least(
      taught + extract(epoch from now() - coalesce(s.segment_started_at, s.starts_at))::numeric / 60,
      c.duration_minutes
    );
  end if;

  student_ids := array(select ce.student_id from public.class_enrolments ce where ce.class_id = c.id);

  if p_kind = 'rain' and taught * 100 >= c.duration_minutes * public.setting_value('rain_delivered_percent') then
    update public.sessions
    set status = 'done',
        taught_minutes = taught,
        rain_stopped = true,
        hold_started_at = null,
        last_thunder_at = null,
        segment_started_at = null
    where id = s.id;
    foreach sid in array coalesce(student_ids, '{}') loop
      perform public.deduct_session(s.id, sid, 'rain');
    end loop;
    perform public.notify_students(
      student_ids, s.id, 'Class stopped for rain. Most of the lesson was taught, so it counts as a session.'
    );
    return 'counted';
  end if;

  update public.sessions
  set status = 'cancelled',
      cancel_kind = p_kind,
      cancel_reason = p_reason,
      taught_minutes = taught,
      rain_stopped = rain_stopped or p_kind = 'rain',
      hold_started_at = null,
      last_thunder_at = null,
      segment_started_at = null,
      coach_pay_rm = case when p_kind = 'rain' then public.setting_value('coach_rain_pay_rm') end
  where id = s.id;

  expires := now() + make_interval(days => public.setting_value('make_up_token_validity_days')::int);
  insert into public.make_up_tokens (student_id, class_id, source_session_id, reason, expires_at)
  select ce.student_id, c.id, s.id, p_kind, expires
  from public.class_enrolments ce
  where ce.class_id = c.id
  on conflict (source_session_id, student_id) do nothing;

  perform public.notify_students(
    student_ids,
    s.id,
    format(
      'Class cancelled (%s). Your child has a make-up token valid until %s. OSA will offer make-up times.',
      p_reason,
      to_char(expires at time zone 'Asia/Kuala_Lumpur', 'DD Mon YYYY')
    )
  );
  return 'cancelled';
end;
$$;

-- Payment status for a student. Coaches and other viewers get Paid, Due soon or Overdue, never amounts.
-- A manager also sees On hold, which starts on the hold day after the due date unless a grace period applies.
create function public.payment_status(p_student_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  oldest_due date;
  grace_until date;
begin
  select min(due_on) into oldest_due
  from public.invoices
  where student_id = p_student_id and status = 'unpaid';
  if oldest_due is null then
    return 'paid';
  end if;
  if oldest_due >= public.malaysia_today() then
    return 'due_soon';
  end if;

  select until into grace_until from public.payment_grace where student_id = p_student_id;
  if public.malaysia_today() - oldest_due >= public.setting_value('overdue_hold_day')::int
     and (grace_until is null or grace_until < public.malaysia_today()) then
    return 'on_hold';
  end if;
  return 'overdue';
end;
$$;

create function public.student_payment_status(p_student_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  status text;
begin
  if not public.can_see_student(p_student_id) then
    return null;
  end if;
  status := public.payment_status(p_student_id);
  if status = 'on_hold' and public.current_account_role() not in ('owner', 'department_head') then
    status := 'overdue';
  end if;
  return status;
end;
$$;

-- Renewal invoices go out before a package ends. Payment reminders go out before the due date.
-- Runs when managers open the billing page.
create function public.generate_billing()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  today date := public.malaysia_today();
  renew_days integer := public.setting_value('renewal_invoice_days_before_end')::int;
  remind_days integer := public.setting_value('first_reminder_days_before_end')::int;
begin
  if public.current_account_role() not in ('owner', 'department_head') then
    return;
  end if;

  for r in
    select distinct on (student_id) student_id, package_id, ends_on
    from public.student_packages
    order by student_id, ends_on desc
  loop
    if r.ends_on >= today
       and r.ends_on <= today + renew_days
       and exists (select 1 from public.packages p where p.id = r.package_id and p.is_active and p.price is not null)
       and not exists (
         select 1 from public.invoices i
         where i.student_id = r.student_id and i.kind = 'renewal' and i.due_on = r.ends_on
       ) then
      perform public.make_invoice(r.student_id, r.package_id, true, r.ends_on, 'renewal');
    end if;
  end loop;

  for r in
    select id, student_id, amount, due_on
    from public.invoices
    where status = 'unpaid' and kind = 'renewal' and reminder_sent_at is null and due_on <= today + remind_days
  loop
    perform public.notify_students(
      array[r.student_id],
      null,
      format('Renewal of RM %s is due on %s.', r.amount, to_char(r.due_on, 'DD Mon YYYY'))
    );
    update public.invoices set reminder_sent_at = now() where id = r.id;
  end loop;
end;
$$;

create function public.set_payment_grace(p_student_id uuid, p_until date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_account_role() not in ('owner', 'department_head') then
    raise exception 'Only managers can allow a grace period.';
  end if;
  insert into public.payment_grace (student_id, until, set_by)
  values (p_student_id, p_until, auth.uid())
  on conflict (student_id) do update set until = excluded.until, set_by = excluded.set_by, set_at = now();
end;
$$;

create function public.resolve_alert(p_alert_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_account_role() not in ('owner', 'department_head') then
    raise exception 'Only managers can close an alert.';
  end if;
  update public.operation_alerts
  set resolved_at = now(), resolved_by = auth.uid()
  where id = p_alert_id;
end;
$$;

-- Money and deductions are audited.
create trigger invoices_audit
  after insert or update on public.invoices
  for each row execute function public.write_audit_log();
create trigger payments_audit
  after insert or update on public.payments
  for each row execute function public.write_audit_log();
create trigger student_packages_audit
  after insert or update on public.student_packages
  for each row execute function public.write_audit_log();
create trigger session_deductions_audit
  after insert or update or delete on public.session_deductions
  for each row execute function public.write_audit_log();
create trigger payment_grace_audit
  after insert or update on public.payment_grace
  for each row execute function public.write_audit_log();
create trigger operation_alerts_audit
  after insert or update on public.operation_alerts
  for each row execute function public.write_audit_log();

alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.student_packages enable row level security;
alter table public.session_deductions enable row level security;
alter table public.payment_grace enable row level security;
alter table public.operation_alerts enable row level security;

revoke all on public.invoices, public.payments, public.student_packages, public.session_deductions,
  public.payment_grace, public.operation_alerts from anon;
revoke insert, update, delete on public.invoices, public.payments, public.student_packages,
  public.session_deductions, public.payment_grace, public.operation_alerts from authenticated;

-- Coaches never read invoices or payments. Guardians and adult students see their own.
create policy "see invoices" on public.invoices for select to authenticated
  using (public.can_see_billing(student_id));
create policy "see payments" on public.payments for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id));
create policy "see student packages" on public.student_packages for select to authenticated
  using (public.can_see_billing(student_id));
create policy "see session deductions" on public.session_deductions for select to authenticated
  using (public.can_see_billing(student_id));
create policy "managers see grace" on public.payment_grace for select to authenticated
  using (public.current_account_role() in ('owner', 'department_head'));
create policy "managers see alerts" on public.operation_alerts for select to authenticated
  using (public.current_account_role() in ('owner', 'department_head'));

revoke execute on function public.make_invoice(uuid, uuid, boolean, date, text),
  public.deduct_session(uuid, uuid, text), public.reverse_deduction(uuid, uuid),
  public.payment_status(uuid), public.attendance_billing(), public.close_session(uuid, text, text)
  from anon, authenticated;
revoke execute on function public.create_invoice(uuid, uuid, boolean), public.record_payment(uuid, text, text),
  public.generate_billing(), public.set_payment_grace(uuid, date), public.resolve_alert(uuid)
  from anon;
