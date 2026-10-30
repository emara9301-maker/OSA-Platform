-- An account that manages itself can create its own family, and then link children to it.
create function public.create_my_family(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_family uuid;
begin
  if auth.uid() is null or public.is_staff() then
    raise exception 'Only a family or student account can create a family.';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'Enter a name for the family.';
  end if;
  if exists (select 1 from public.family_guardians where profile_id = auth.uid()) then
    raise exception 'Your account already has a family.';
  end if;

  insert into public.families (name, created_by) values (trim(p_name), auth.uid())
  returning id into new_family;
  insert into public.family_guardians (family_id, profile_id, relationship) values (new_family, auth.uid(), 'parent');
  return new_family;
end;
$$;

revoke execute on function public.create_my_family(text) from public, anon;
grant execute on function public.create_my_family(text) to authenticated;
