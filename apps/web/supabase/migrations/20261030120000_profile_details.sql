-- Every account keeps its date of birth on its profile, and every new account must have a username and a date of birth,
-- including accounts created by staff.
alter table public.profiles add column date_of_birth date;

-- Accounts that already exist without a date of birth get their student record's date, or a placeholder to be corrected later.
update public.profiles p
set date_of_birth = coalesce(
  (select s.date_of_birth from public.students s where s.account_id = p.id order by s.created_at limit 1),
  date '1990-01-01'
)
where p.date_of_birth is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dob date := nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date;
  account_username text := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  display_name text := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    account_username,
    split_part(new.email, '@', 1)
  );
begin
  if dob is null or account_username is null then
    raise exception 'Enter a username and a date of birth.';
  end if;

  insert into public.profiles (id, email, full_name, phone, username, age, date_of_birth)
  values (
    new.id,
    new.email,
    display_name,
    new.raw_user_meta_data ->> 'phone',
    account_username,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'age', '')::integer,
      extract(year from age(current_date, dob))::integer
    ),
    dob
  );

  -- A self-registered account gets its own student record, to be placed in a pool when it buys a package.
  if new.raw_user_meta_data ->> 'full_name' is not null then
    insert into public.students (account_id, full_name, date_of_birth)
    values (new.id, new.raw_user_meta_data ->> 'full_name', dob);
  end if;

  return new;
end;
$$;

-- The account registers itself at a pool. Its own student record is placed in the pool if it has none yet.
drop function public.register_self_student(uuid, date);

create function public.register_self_student(p_pool_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pool_condo uuid;
  existing_id uuid;
  existing_pool uuid;
  profile_dob date;
  account_name text;
  new_id uuid;
begin
  if auth.uid() is null or public.is_staff() then
    raise exception 'Only an adult student account can register itself here.';
  end if;

  select c.id into pool_condo
  from public.pools p join public.condos c on c.id = p.condo_id
  where p.id = p_pool_id and c.status = 'ready';
  if pool_condo is null then
    raise exception 'Choose one of our pools.';
  end if;

  select s.id, s.pool_id into existing_id, existing_pool
  from public.students s where s.account_id = auth.uid() limit 1;
  if existing_id is not null then
    if existing_pool = p_pool_id then
      return existing_id;
    end if;
    if existing_pool is not null then
      raise exception 'Your student profile is at another pool.';
    end if;
    update public.students set pool_id = p_pool_id, condo_id = pool_condo where id = existing_id;
    return existing_id;
  end if;

  select pr.date_of_birth, coalesce(nullif(trim(pr.full_name), ''), pr.username, pr.email)
  into profile_dob, account_name
  from public.profiles pr where pr.id = auth.uid();

  insert into public.students (full_name, date_of_birth, condo_id, pool_id, account_id)
  values (account_name, profile_dob, pool_condo, p_pool_id, auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.register_self_student(uuid) from public, anon;
grant execute on function public.register_self_student(uuid) to authenticated;
