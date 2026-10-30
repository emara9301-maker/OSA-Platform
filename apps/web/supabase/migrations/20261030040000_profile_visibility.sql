-- Accounts are visible to the people who may assign their role (role_grants), plus the account itself.
-- A head coach sees coaches and students; a department head does not see the owner.
create function public.can_see_profile_role(target_role public.account_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.role_grants
    where actor_role = public.current_account_role() and role_grants.target_role = can_see_profile_role.target_role
  );
$$;

drop policy "role managers can read all profiles" on public.profiles;

create policy "read own profile or profiles you may manage"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.can_see_profile_role(role));

drop function public.is_role_manager();
