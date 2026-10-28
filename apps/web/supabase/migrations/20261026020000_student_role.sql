-- Part 1 (revised): one table for every account. Everyone who signs up starts as a student.
alter type public.staff_role rename to account_role;
alter type public.account_role add value if not exists 'student';

alter table public.staff rename to profiles;

drop policy "owner can read all staff" on public.profiles;
drop function public.current_staff_role();

create function public.current_account_role()
returns public.account_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create policy "owner can read all profiles"
  on public.profiles for select
  to authenticated
  using (public.current_account_role() = 'owner');
