-- A condo can have several pools. Each pool has its own hours, rules, access notes and photo, and its own packages.
-- Classes and students belong to a pool. A condo keeps its address, area and contact, and every condo starts with one pool.

create table public.pools (
  id uuid primary key default gen_random_uuid(),
  condo_id uuid not null references public.condos (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  pool_hours text,
  rules text,
  access_notes text,
  image_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger pools_audit
  after insert or update or delete on public.pools
  for each row execute function public.write_audit_log();

alter table public.pools enable row level security;
revoke all on public.pools from anon;
revoke insert, update, delete on public.pools from authenticated;

create policy "staff read pools" on public.pools for select to authenticated
  using (public.is_staff());
create policy "managers add pools" on public.pools for insert to authenticated
  with check (public.current_account_role() in ('owner', 'department_head'));
create policy "managers change pools" on public.pools for update to authenticated
  using (public.current_account_role() in ('owner', 'department_head'))
  with check (public.current_account_role() in ('owner', 'department_head'));
create policy "managers remove pools" on public.pools for delete to authenticated
  using (public.current_account_role() in ('owner', 'department_head'));

-- Every new condo starts with one pool, which the managers can rename, change or add to.
create function public.condo_default_pool()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.pools (condo_id, name, pool_hours, sort_order)
  values (new.id, 'Main pool', new.pool_hours, 0);
  return new;
end;
$$;

create trigger condos_default_pool
  after insert on public.condos
  for each row execute function public.condo_default_pool();

-- Existing condos get their first pool, carrying over the hours, rules, access notes and photo.
insert into public.pools (condo_id, name, pool_hours, rules, access_notes, image_url)
select c.id, 'Main pool', c.pool_hours, c.rules, c.access_notes, c.image_url
from public.condos c
where not exists (select 1 from public.pools p where p.condo_id = c.id);

alter table public.packages add column pool_id uuid references public.pools (id);
alter table public.classes add column pool_id uuid references public.pools (id);
alter table public.students add column pool_id uuid references public.pools (id);

update public.packages x set pool_id = (select p.id from public.pools p where p.condo_id = x.condo_id order by p.sort_order, p.created_at limit 1)
where x.condo_id is not null;
update public.classes x set pool_id = (select p.id from public.pools p where p.condo_id = x.condo_id order by p.sort_order, p.created_at limit 1);
update public.students x set pool_id = (select p.id from public.pools p where p.condo_id = x.condo_id order by p.sort_order, p.created_at limit 1);

-- A package is sold at one pool, and its condo follows the pool.
create function public.packages_pool_sync()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.pool_id is not null then
    select condo_id into new.condo_id from public.pools where id = new.pool_id;
  elsif new.condo_id is not null then
    select id into new.pool_id from public.pools where condo_id = new.condo_id order by sort_order, created_at limit 1;
  end if;
  return new;
end;
$$;

create trigger packages_pool_sync
  before insert or update on public.packages
  for each row execute function public.packages_pool_sync();

-- A class or a student belongs to a pool of its condo. Without a chosen pool, the condo's first pool is used.
create function public.scope_pool_sync()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.pool_id is null or not exists (select 1 from public.pools where id = new.pool_id and condo_id = new.condo_id) then
    select id into new.pool_id from public.pools where condo_id = new.condo_id order by sort_order, created_at limit 1;
  end if;
  return new;
end;
$$;

create trigger classes_pool_sync
  before insert or update on public.classes
  for each row execute function public.scope_pool_sync();
create trigger students_pool_sync
  before insert or update on public.students
  for each row execute function public.scope_pool_sync();

-- A family buys a package only for a child at the same pool.
create or replace function public.make_invoice(
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
  if pkg.pool_id is distinct from stu.pool_id then
    raise exception 'This package is not offered at this pool.';
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

-- Public pages: the condos, one condo's pools, and one pool's details.
drop function public.public_condos();

create function public.public_condos()
returns table (id uuid, name text, area text, image_url text, pool_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.area, c.image_url,
    (select count(*)::int from public.pools p where p.condo_id = c.id)
  from public.condos c
  where c.status = 'ready'
  order by c.name;
$$;

revoke execute on function public.public_condos() from public;
grant execute on function public.public_condos() to anon, authenticated;

create function public.public_condo_details(p_condo_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'area', c.area,
    'address', c.address,
    'image_url', c.image_url,
    'pools', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'pool_hours', p.pool_hours, 'image_url', p.image_url)
        order by p.sort_order, p.created_at)
      from public.pools p where p.condo_id = c.id
    ), '[]'::jsonb)
  )
  from public.condos c
  where c.id = p_condo_id and c.status = 'ready';
$$;

grant execute on function public.public_condo_details(uuid) to anon, authenticated;

-- A pool's page: its own hours, rules, access notes and photo, plus the condo's area, address, phone and map.
drop function public.public_pool_details(uuid);

create function public.public_pool_details(p_pool_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'condo_id', c.id,
    'condo_name', c.name,
    'image_url', p.image_url,
    'pool_hours', p.pool_hours,
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object('label', f.label, 'value', v.value) order by f.sort_order)
      from public.pool_fields f
      cross join lateral (
        select case f.key
          when 'area' then c.area
          when 'address' then c.address
          when 'pool_hours' then p.pool_hours
          when 'contact_phone' then c.contact_phone
          when 'rules' then p.rules
          when 'access_notes' then p.access_notes
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
  from public.pools p
  join public.condos c on c.id = p.condo_id
  where p.id = p_pool_id and c.status = 'ready';
$$;

grant execute on function public.public_pool_details(uuid) to anon, authenticated;
