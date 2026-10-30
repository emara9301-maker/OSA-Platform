-- The roles the signed-in account may give to someone else (from role_grants).
create function public.assignable_roles()
returns setof public.account_role
language sql
stable
security definer
set search_path = ''
as $$
  select target_role from public.role_grants where actor_role = public.current_account_role();
$$;
