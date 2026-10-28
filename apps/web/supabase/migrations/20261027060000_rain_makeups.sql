-- Part 9: rain holds, cancellations and make-up lessons.
-- Every rule here runs on the server. A lesson that is cancelled issues make-up tokens to each enrolled student.
-- A make-up is a separate lesson for the students who hold tokens. A session is deducted only when that student attends (part 10).

insert into public.settings (key, value, label, unit) values
  ('rain_hold_minutes', 30, 'Minutes after the last thunder before a paused class can resume', 'minutes');

-- Sessions can be paused for weather. A make-up is marked, and a cancellation records its reason.
alter table public.sessions drop constraint sessions_status_check;
alter table public.sessions add constraint sessions_status_check
  check (status in ('scheduled', 'paused', 'cancelled', 'done'));

alter table public.sessions
  add column is_make_up boolean not null default false,
  add column cancel_kind text check (cancel_kind in ('rain', 'holiday', 'coach_absence')),
  add column rain_stopped boolean not null default false,
  add column hold_started_at timestamptz,
  add column last_thunder_at timestamptz,
  add column segment_started_at timestamptz,
  add column taught_minutes numeric(6, 2) not null default 0,
  add column coach_pay_rm numeric(10, 2),
  add column ops_approved boolean not null default false;

-- Regenerating a timetable must not remove make-up lessons that students have booked.
create or replace function public.classes_generate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- Future scheduled sessions follow the new timetable. Cancelled and finished sessions are kept.
    delete from public.sessions
    where class_id = new.id and status = 'scheduled' and starts_at > now() and is_make_up = false;
  end if;
  perform public.generate_sessions(new.id);
  return new;
end;
$$;

-- Session creation is audited too, so a make-up lesson leaves a trail.
drop trigger sessions_audit on public.sessions;
create trigger sessions_audit
  after insert or update on public.sessions
  for each row execute function public.write_audit_log();

create table public.make_up_tokens (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  source_session_id uuid not null references public.sessions (id) on delete cascade,
  reason text not null check (reason in ('rain', 'holiday', 'coach_absence')),
  status text not null default 'open' check (status in ('open', 'booked', 'used')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  make_up_session_id uuid references public.sessions (id) on delete set null,
  used_at timestamptz,
  unique (source_session_id, student_id)
);

-- Messages to families. The mock sender records every message here until WhatsApp is connected.
create table public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  body text not null,
  created_at timestamptz not null default now()
);

create trigger make_up_tokens_audit
  after insert or update on public.make_up_tokens
  for each row execute function public.write_audit_log();

create function public.setting_value(p_key text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select value from public.settings where key = p_key;
$$;

-- Sends the same message to every guardian and adult student of the given students.
create function public.notify_students(p_student_ids uuid[], p_session_id uuid, p_body text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.outbound_messages (recipient_id, session_id, body)
  select r.profile_id, p_session_id, p_body
  from (
    select fg.profile_id
    from public.students s
    join public.family_guardians fg on fg.family_id = s.family_id
    where s.id = any(p_student_ids)
    union
    select s.account_id
    from public.students s
    where s.id = any(p_student_ids) and s.account_id is not null
  ) r;
$$;

-- Ends a lesson. A rain stop that taught at least the set share counts as a session. Anything else is cancelled,
-- and every enrolled student gets a make-up token. Rain cancellations also record the coach's pay.
create function public.close_session(p_session_id uuid, p_kind text, p_reason text)
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

-- The coach pauses a running lesson. Taught minutes so far are kept. If the pause starts after the middle
-- of the lesson, the lesson is ended straight away.
create function public.start_weather_hold(p_session_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sessions%rowtype;
  c public.classes%rowtype;
begin
  if not public.can_mark_session(p_session_id) then
    raise exception 'You cannot change this lesson.';
  end if;
  select * into s from public.sessions where id = p_session_id for update;
  select * into c from public.classes where id = s.class_id;
  if s.status <> 'scheduled' or now() < s.starts_at or now() >= s.ends_at then
    raise exception 'A weather hold can only be placed while the lesson is running.';
  end if;

  update public.sessions
  set status = 'paused',
      hold_started_at = now(),
      last_thunder_at = now(),
      taught_minutes = s.taught_minutes
        + extract(epoch from now() - coalesce(s.segment_started_at, s.starts_at))::numeric / 60,
      segment_started_at = null,
      rain_stopped = true
  where id = s.id;

  if now() >= s.starts_at + make_interval(secs => c.duration_minutes * 30) then
    return public.close_session(s.id, 'rain', 'Rain');
  end if;

  perform public.notify_students(
    array(select ce.student_id from public.class_enrolments ce where ce.class_id = c.id),
    s.id,
    format('Class paused for thunder, we will update you in %s minutes', public.setting_value('rain_hold_minutes')::int)
  );
  return 'paused';
end;
$$;

-- Each new thunder restarts the wait before the class can resume.
create function public.record_thunder(p_session_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sessions%rowtype;
  c public.classes%rowtype;
begin
  if not public.can_mark_session(p_session_id) then
    raise exception 'You cannot change this lesson.';
  end if;
  select * into s from public.sessions where id = p_session_id for update;
  select * into c from public.classes where id = s.class_id;
  if s.status <> 'paused' then
    raise exception 'This lesson is not on weather hold.';
  end if;

  if now() >= s.starts_at + make_interval(secs => c.duration_minutes * 30) then
    return public.close_session(s.id, 'rain', 'Rain');
  end if;

  update public.sessions set last_thunder_at = now() where id = s.id;
  return 'paused';
end;
$$;

-- The class resumes once the wait has passed since the last thunder. If the lesson is past its middle, it is ended.
create function public.resume_weather_hold(p_session_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sessions%rowtype;
  c public.classes%rowtype;
begin
  if not public.can_mark_session(p_session_id) then
    raise exception 'You cannot change this lesson.';
  end if;
  select * into s from public.sessions where id = p_session_id for update;
  select * into c from public.classes where id = s.class_id;
  if s.status <> 'paused' then
    raise exception 'This lesson is not on weather hold.';
  end if;

  if now() >= s.starts_at + make_interval(secs => c.duration_minutes * 30) then
    return public.close_session(s.id, 'rain', 'Rain');
  end if;

  if now() < coalesce(s.last_thunder_at, s.hold_started_at)
      + make_interval(mins => public.setting_value('rain_hold_minutes')::int) then
    raise exception '%', format(
      'The class can resume %s minutes after the last thunder.', public.setting_value('rain_hold_minutes')::int
    );
  end if;

  update public.sessions
  set status = 'scheduled',
      hold_started_at = null,
      last_thunder_at = null,
      segment_started_at = now()
  where id = s.id;

  perform public.notify_students(
    array(select ce.student_id from public.class_enrolments ce where ce.class_id = c.id),
    s.id,
    'Class has resumed.'
  );
  return 'resumed';
end;
$$;

create function public.cancel_weather_hold(p_session_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_mark_session(p_session_id) then
    raise exception 'You cannot change this lesson.';
  end if;
  if not exists (select 1 from public.sessions where id = p_session_id and status = 'paused') then
    raise exception 'This lesson is not on weather hold.';
  end if;
  return public.close_session(p_session_id, 'rain', 'Rain');
end;
$$;

-- Managers cancel a lesson for a holiday, coach absence, or rain before it starts.
create function public.cancel_session_for_reason(p_session_id uuid, p_kind text, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_account_role() not in ('owner', 'department_head') then
    raise exception 'Only managers can cancel a lesson.';
  end if;
  if p_kind not in ('rain', 'holiday', 'coach_absence') then
    raise exception 'Unknown cancellation reason.';
  end if;
  return public.close_session(
    p_session_id,
    p_kind,
    coalesce(
      nullif(trim(p_reason), ''),
      case p_kind when 'rain' then 'Rain' when 'holiday' then 'Public holiday' else 'Coach absence' end
    )
  );
end;
$$;

-- Ends any paused lesson that has passed its middle. Staff call this when they open the coach app or the board.
create function public.settle_weather_holds()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if not public.is_staff() then
    return;
  end if;
  for r in
    select s.id
    from public.sessions s
    join public.classes c on c.id = s.class_id
    where s.status = 'paused' and now() >= s.starts_at + make_interval(secs => c.duration_minutes * 30)
  loop
    perform public.close_session(r.id, 'rain', 'Rain');
  end loop;
end;
$$;

-- Books a make-up lesson for the students holding the given tokens. Managers only.
-- A clash with another lesson of the same coach needs operations approval.
create function public.schedule_make_up(
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
    raise exception 'Only managers can book make-up lessons.';
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

-- Marking a student in a make-up lesson uses that student's token, whether they attended or not.
create function public.use_make_up_token()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.sessions where id = new.session_id and is_make_up) then
    update public.make_up_tokens
    set status = 'used', used_at = now()
    where make_up_session_id = new.session_id and student_id = new.student_id and status = 'booked';
  end if;
  return new;
end;
$$;

create trigger attendance_use_make_up
  after insert or update on public.attendance
  for each row execute function public.use_make_up_token();

alter table public.make_up_tokens enable row level security;
alter table public.outbound_messages enable row level security;
revoke all on public.make_up_tokens, public.outbound_messages from anon;
revoke insert, update, delete on public.make_up_tokens, public.outbound_messages from authenticated;

-- A student, guardian or coach sees tokens for the students they can see. Managers see all.
create policy "see make-up tokens" on public.make_up_tokens for select to authenticated
  using (public.can_see_student(student_id));

-- A family sees its own messages. Managers see every message.
create policy "see own messages" on public.outbound_messages for select to authenticated
  using (recipient_id = auth.uid() or public.current_account_role() in ('owner', 'department_head'));

revoke execute on function public.setting_value(text), public.notify_students(uuid[], uuid, text),
  public.close_session(uuid, text, text), public.use_make_up_token() from anon, authenticated;
revoke execute on function public.start_weather_hold(uuid), public.record_thunder(uuid),
  public.resume_weather_hold(uuid), public.cancel_weather_hold(uuid),
  public.cancel_session_for_reason(uuid, text, text), public.settle_weather_holds(),
  public.schedule_make_up(uuid, timestamptz, uuid[], boolean) from anon;
