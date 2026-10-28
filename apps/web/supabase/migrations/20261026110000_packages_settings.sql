-- Packages and settings. Only the owner and department heads can see or change them.

-- The audit trigger now also finds the record key for tables keyed by "key" (settings).
create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (actor_id, action, table_name, record_id, before_data, after_data)
  values (
    auth.uid(),
    lower(TG_OP),
    TG_TABLE_NAME,
    coalesce(
      to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'key',
      to_jsonb(old) ->> 'id', to_jsonb(old) ->> 'key'
    ),
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create type public.package_type as enum ('private_1_1', 'semi_private_1_2', 'small_group', 'adult');
create type public.package_badge as enum ('most_popular', 'new', 'promo');

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  short_pitch text,
  age_min integer check (age_min >= 0),
  age_max integer check (age_max >= 0),
  level_range text,
  type public.package_type not null,
  sessions_count integer not null check (sessions_count > 0),
  validity_days integer not null default 30 check (validity_days > 0),
  session_minutes integer not null check (session_minutes > 0),
  price numeric(10, 2) check (price >= 0),
  price_per_session numeric(10, 2) generated always as (round(price / sessions_count, 2)) stored,
  badge public.package_badge,
  image_url text,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint packages_age_range check (age_min is null or age_max is null or age_min <= age_max)
);

create function public.prepare_package()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger packages_prepare
  before insert or update on public.packages
  for each row execute function public.prepare_package();

create trigger packages_audit
  after insert or update or delete on public.packages
  for each row execute function public.write_audit_log();

alter table public.packages enable row level security;
revoke all on public.packages from anon;
revoke delete on public.packages from authenticated;

create policy "owner and department heads read packages"
  on public.packages for select
  to authenticated
  using (public.current_account_role() in ('owner', 'department_head'));

create policy "owner and department heads add packages"
  on public.packages for insert
  to authenticated
  with check (public.current_account_role() in ('owner', 'department_head'));

create policy "owner and department heads edit packages"
  on public.packages for update
  to authenticated
  using (public.current_account_role() in ('owner', 'department_head'))
  with check (public.current_account_role() in ('owner', 'department_head'));

-- Settings: every number the business can change, with its default.
create table public.settings (
  key text primary key,
  value numeric not null check (value >= 0),
  label text not null,
  unit text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

insert into public.settings (key, value, label, unit) values
  ('renewal_invoice_days_before_end', 7, 'Renewal invoice is sent this many days before the package ends', 'days'),
  ('first_reminder_days_before_end', 3, 'First payment reminder is sent this many days before the package ends', 'days'),
  ('overdue_hold_day', 37, 'Classes go on hold on this day of the cycle, unless a manager allows a grace period', 'day'),
  ('sibling_discount_percent', 20, 'Discount for each sibling after the first', '%'),
  ('make_up_token_validity_days', 90, 'A make-up token is valid for this many days after it is issued', 'days'),
  ('make_up_min_notice_hours', 6, 'Minimum notice before a class for booking a make-up', 'hours'),
  ('rain_delivered_percent', 50, 'Share of a class taught before a rain cancellation that counts as a session', '%'),
  ('coach_rain_pay_rm', 20, 'Coach pay for a class cancelled for rain', 'RM');

create function public.prepare_setting()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger settings_prepare
  before update on public.settings
  for each row execute function public.prepare_setting();

create trigger settings_audit
  after update on public.settings
  for each row execute function public.write_audit_log();

alter table public.settings enable row level security;
revoke all on public.settings from anon;
revoke insert, delete on public.settings from authenticated;

create policy "owner and department heads read settings"
  on public.settings for select
  to authenticated
  using (public.current_account_role() in ('owner', 'department_head'));

create policy "owner and department heads change settings"
  on public.settings for update
  to authenticated
  using (public.current_account_role() in ('owner', 'department_head'))
  with check (public.current_account_role() in ('owner', 'department_head'));
