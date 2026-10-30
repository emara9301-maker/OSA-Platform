-- A child is registered at a pool (its condo follows from the pool), so the package bought there matches.
drop function public.register_child(text, date, uuid);

create function public.register_child(p_full_name text, p_date_of_birth date, p_pool_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pool_condo uuid;
  new_family uuid;
  new_child uuid;
begin
  if auth.uid() is null or public.is_staff() then
    raise exception 'Only a parent or an adult student can register a child here.';
  end if;
  if nullif(trim(p_full_name), '') is null or p_date_of_birth is null or p_date_of_birth > public.malaysia_today() then
    raise exception 'Enter the child''s name and a valid date of birth.';
  end if;
  select c.id into pool_condo
  from public.pools p join public.condos c on c.id = p.condo_id
  where p.id = p_pool_id and c.status = 'ready';
  if pool_condo is null then
    raise exception 'Choose one of our pools.';
  end if;

  insert into public.families (name) values (trim(p_full_name) || ' family') returning id into new_family;
  insert into public.family_guardians (family_id, profile_id, relationship) values (new_family, auth.uid(), 'parent');
  insert into public.students (full_name, date_of_birth, condo_id, pool_id, family_id)
  values (trim(p_full_name), p_date_of_birth, pool_condo, p_pool_id, new_family)
  returning id into new_child;
  return new_child;
end;
$$;

revoke execute on function public.register_child(text, date, uuid) from anon;
