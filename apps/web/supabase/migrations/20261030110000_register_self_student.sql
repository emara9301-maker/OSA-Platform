-- An adult with their own account registers as a student at a pool, so they can buy a package for themselves.
create function public.register_self_student(p_pool_id uuid, p_date_of_birth date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pool_condo uuid;
  existing_pool uuid;
  existing_id uuid;
  new_id uuid;
  account_name text;
begin
  if auth.uid() is null or public.is_staff() then
    raise exception 'Only an adult student account can register itself here.';
  end if;

  select s.id, s.pool_id into existing_id, existing_pool
  from public.students s where s.account_id = auth.uid() limit 1;
  if existing_id is not null then
    if existing_pool = p_pool_id then
      return existing_id;
    end if;
    raise exception 'Your student profile is at another pool.';
  end if;

  if p_date_of_birth is null or p_date_of_birth > public.malaysia_today() then
    raise exception 'Enter your date of birth.';
  end if;

  select c.id into pool_condo
  from public.pools p join public.condos c on c.id = p.condo_id
  where p.id = p_pool_id and c.status = 'ready';
  if pool_condo is null then
    raise exception 'Choose one of our pools.';
  end if;

  select coalesce(nullif(trim(full_name), ''), username, email) into account_name
  from public.profiles where id = auth.uid();

  insert into public.students (full_name, date_of_birth, condo_id, pool_id, account_id)
  values (account_name, p_date_of_birth, pool_condo, p_pool_id, auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.register_self_student(uuid, date) from public, anon;
grant execute on function public.register_self_student(uuid, date) to authenticated;
