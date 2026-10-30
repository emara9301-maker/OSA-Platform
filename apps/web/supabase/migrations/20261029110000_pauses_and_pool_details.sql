-- Part A: families and managers pause a package. The end date moves by the pause length, and no session is taken during a pause.
insert into public.settings (key, value, label, unit) values
  ('family_pause_allowed', 1, 'Families may pause their package (1 = yes, 0 = no)', 'yes/no');

create table public.package_pauses (
  id uuid primary key default gen_random_uuid(),
  student_package_id uuid not null references public.student_packages (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  requested_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint package_pauses_dates check (ends_on >= starts_on)
);

create trigger package_pauses_audit
  after insert or update on public.package_pauses
  for each row execute function public.write_audit_log();

alter table public.package_pauses enable row level security;
revoke all on public.package_pauses from anon;
revoke insert, update, delete on public.package_pauses from authenticated;

create policy "see pauses" on public.package_pauses for select to authenticated
  using (exists (
    select 1 from public.student_packages sp
    where sp.id = student_package_id and public.can_see_billing(sp.student_id)
  ));

-- What a family may do right now, so the portal can show or hide the pause button.
create function public.pause_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'allowed', public.setting_value('family_pause_allowed') = 1,
    'max_days', public.setting_value('pause_max_days')
  );
$$;

create function public.pause_package(p_student_package_id uuid, p_starts_on date, p_ends_on date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sp public.student_packages%rowtype;
  managers boolean := public.current_account_role() in ('owner', 'department_head');
  days integer;
  new_id uuid;
begin
  select * into sp from public.student_packages where id = p_student_package_id for update;
  if not found or not public.can_see_billing(sp.student_id) then
    raise exception 'You cannot pause this package.';
  end if;
  if not managers and public.setting_value('family_pause_allowed') <> 1 then
    raise exception 'Pausing a package is not open for families right now.';
  end if;
  if sp.ends_on < public.malaysia_today() then
    raise exception 'This package has already ended.';
  end if;
  if p_starts_on < public.malaysia_today() or p_ends_on < p_starts_on then
    raise exception 'A pause starts today or later, and ends on or after its start.';
  end if;

  days := p_ends_on - p_starts_on + 1;
  if not managers and days > public.setting_value('pause_max_days')::int then
    raise exception '%', format('A pause can be at most %s days.', public.setting_value('pause_max_days')::int);
  end if;
  if exists (
    select 1 from public.package_pauses
    where student_package_id = sp.id and status = 'active' and starts_on <= p_ends_on and ends_on >= p_starts_on
  ) then
    raise exception 'This package already has a pause in these dates.';
  end if;

  insert into public.package_pauses (student_package_id, starts_on, ends_on, requested_by)
  values (sp.id, p_starts_on, p_ends_on, auth.uid())
  returning id into new_id;
  update public.student_packages set ends_on = ends_on + days where id = sp.id;

  perform public.notify_students(
    array[sp.student_id],
    null,
    format('Package paused from %s to %s. The end date moves by %s days.',
      to_char(p_starts_on, 'DD Mon YYYY'), to_char(p_ends_on, 'DD Mon YYYY'), days)
  );
  return new_id;
end;
$$;

-- Ends a pause. The days not yet reached give back to the package end date. Days already paused stay paused.
create function public.cancel_pause(p_pause_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  pz public.package_pauses%rowtype;
  sp public.student_packages%rowtype;
  managers boolean := public.current_account_role() in ('owner', 'department_head');
  remaining integer;
begin
  select * into pz from public.package_pauses where id = p_pause_id for update;
  if not found then
    raise exception 'Pause not found.';
  end if;
  select * into sp from public.student_packages where id = pz.student_package_id;
  if not public.can_see_billing(sp.student_id) then
    raise exception 'You cannot change this pause.';
  end if;
  if not managers and public.setting_value('family_pause_allowed') <> 1 then
    raise exception 'Pausing a package is not open for families right now.';
  end if;
  if pz.status <> 'active' or pz.ends_on < public.malaysia_today() then
    raise exception 'This pause is no longer active.';
  end if;

  remaining := greatest(0, pz.ends_on - greatest(pz.starts_on, public.malaysia_today()) + 1);
  update public.package_pauses set status = 'cancelled' where id = pz.id;
  update public.student_packages set ends_on = greatest(starts_on, ends_on - remaining) where id = sp.id;

  perform public.notify_students(
    array[sp.student_id],
    null,
    format('The pause was cancelled. The package ends on %s.',
      to_char((select ends_on from public.student_packages where id = sp.id), 'DD Mon YYYY'))
  );
  return remaining;
end;
$$;

-- A session on a paused date takes nothing, and no operations alert is raised for it.
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

revoke execute on function public.pause_package(uuid, date, date), public.cancel_pause(uuid) from anon;
revoke execute on function public.deduct_session(uuid, uuid, text) from anon, authenticated;

-- Part B: pool details shown to visitors. Managers choose which standard details show, and add their own.
create table public.pool_fields (
  key text primary key check (key in ('area', 'address', 'pool_hours', 'contact_phone', 'map', 'rules', 'access_notes')),
  label text not null,
  visible boolean not null default true,
  sort_order integer not null
);

insert into public.pool_fields (key, label, visible, sort_order) values
  ('area', 'Area', true, 1),
  ('address', 'Address', true, 2),
  ('pool_hours', 'Pool hours', true, 3),
  ('contact_phone', 'Phone', true, 4),
  ('map', 'Map location', true, 5),
  ('rules', 'Pool rules', true, 6),
  ('access_notes', 'How to get in', true, 7);

create table public.condo_details (
  id uuid primary key default gen_random_uuid(),
  condo_id uuid not null references public.condos (id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  value text not null check (length(trim(value)) > 0),
  visible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create trigger pool_fields_audit
  after update on public.pool_fields
  for each row execute function public.write_audit_log();
create trigger condo_details_audit
  after insert or update or delete on public.condo_details
  for each row execute function public.write_audit_log();

alter table public.pool_fields enable row level security;
alter table public.condo_details enable row level security;
revoke all on public.pool_fields, public.condo_details from anon;
revoke insert, delete on public.pool_fields from authenticated;

create policy "managers read pool fields" on public.pool_fields for select to authenticated
  using (public.current_account_role() in ('owner', 'department_head'));
create policy "managers change pool fields" on public.pool_fields for update to authenticated
  using (public.current_account_role() in ('owner', 'department_head'))
  with check (public.current_account_role() in ('owner', 'department_head'));

create policy "managers read pool details" on public.condo_details for select to authenticated
  using (public.current_account_role() in ('owner', 'department_head'));
create policy "managers add pool details" on public.condo_details for insert to authenticated
  with check (public.current_account_role() in ('owner', 'department_head'));
create policy "managers change pool details" on public.condo_details for update to authenticated
  using (public.current_account_role() in ('owner', 'department_head'))
  with check (public.current_account_role() in ('owner', 'department_head'));
create policy "managers remove pool details" on public.condo_details for delete to authenticated
  using (public.current_account_role() in ('owner', 'department_head'));

-- What a visitor sees for a ready pool: the standard details that are switched on, then the extra details that are shown.
create function public.public_pool_details(p_condo_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object('label', f.label, 'value', v.value) order by f.sort_order)
      from public.pool_fields f
      cross join lateral (
        select case f.key
          when 'area' then c.area
          when 'address' then c.address
          when 'pool_hours' then c.pool_hours
          when 'contact_phone' then c.contact_phone
          when 'rules' then c.rules
          when 'access_notes' then c.access_notes
          when 'map' then case when c.latitude is not null and c.longitude is not null
            then c.latitude::text || ',' || c.longitude::text end
        end as value
      ) v
      where f.visible and nullif(trim(v.value), '') is not null
    ), '[]'::jsonb),
    'extras', coalesce((
      select jsonb_agg(jsonb_build_object('label', d.label, 'value', d.value) order by d.sort_order, d.created_at)
      from public.condo_details d
      where d.condo_id = c.id and d.visible
    ), '[]'::jsonb)
  )
  from public.condos c
  where c.id = p_condo_id and c.status = 'ready';
$$;

grant execute on function public.public_pool_details(uuid) to anon, authenticated;
