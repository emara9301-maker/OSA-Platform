-- Part 1 (revised): who may assign which role. Edit rows here to change the rules.
alter table public.profiles alter column role set default 'student';

create table public.role_grants (
  actor_role public.account_role not null,
  target_role public.account_role not null,
  primary key (actor_role, target_role)
);

-- No policies: only the security definer functions below read this table.
alter table public.role_grants enable row level security;

insert into public.role_grants (actor_role, target_role) values
  ('owner', 'department_head'),
  ('owner', 'sales'),
  ('owner', 'operations'),
  ('owner', 'finance'),
  ('owner', 'head_coach'),
  ('owner', 'coach'),
  ('owner', 'student'),
  ('department_head', 'sales'),
  ('department_head', 'operations'),
  ('department_head', 'finance'),
  ('department_head', 'head_coach'),
  ('department_head', 'coach'),
  ('department_head', 'student'),
  ('head_coach', 'coach'),
  ('head_coach', 'student');

-- Anyone who can assign roles may read the account list.
create function public.is_role_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.role_grants where actor_role = public.current_account_role()
  );
$$;

drop policy "owner can read all profiles" on public.profiles;

create policy "role managers can read all profiles"
  on public.profiles for select
  to authenticated
  using (public.is_role_manager());

-- Creates a student profile for every new account (email code sign-up, or created by an admin).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Changes an account's role. Allowed only if the caller may assign both the current and the new role.
create function public.set_account_role(target_id uuid, new_role public.account_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.account_role := public.current_account_role();
  current_target public.account_role;
begin
  select role into current_target from public.profiles where id = target_id;
  if current_target is null then
    raise exception 'account not found';
  end if;

  if not exists (
    select 1 from public.role_grants where actor_role = actor and target_role = current_target
  ) or not exists (
    select 1 from public.role_grants where actor_role = actor and target_role = new_role
  ) then
    raise exception 'not allowed to change this role';
  end if;

  update public.profiles set role = new_role where id = target_id;
end;
$$;

revoke execute on function public.set_account_role(uuid, public.account_role) from public, anon;
grant execute on function public.set_account_role(uuid, public.account_role) to authenticated;
