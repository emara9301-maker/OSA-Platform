-- Public website: a visitor sees the pools, a signed-in parent registers a child and buys a package.
-- The purchase creates an invoice, which the family pays from the portal (mock gateway).

-- The pools a visitor can choose from. Only ready condos, and only their public details.
create function public.public_condos()
returns table (id uuid, name text, area text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.area from public.condos c where c.status = 'ready' order by c.name;
$$;

-- A parent adds a child. The child gets a family with the parent as guardian, and starts as a lead.
create function public.register_child(p_full_name text, p_date_of_birth date, p_condo_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_family uuid;
  new_child uuid;
begin
  if auth.uid() is null or public.is_staff() then
    raise exception 'Only a parent or an adult student can register a child here.';
  end if;
  if nullif(trim(p_full_name), '') is null or p_date_of_birth is null or p_date_of_birth > public.malaysia_today() then
    raise exception 'Enter the child''s name and a valid date of birth.';
  end if;
  if not exists (select 1 from public.condos where id = p_condo_id and status = 'ready') then
    raise exception 'Choose one of our pools.';
  end if;

  insert into public.families (name) values (trim(p_full_name) || ' family') returning id into new_family;
  insert into public.family_guardians (family_id, profile_id, relationship) values (new_family, auth.uid(), 'parent');
  insert into public.students (full_name, date_of_birth, condo_id, family_id)
  values (trim(p_full_name), p_date_of_birth, p_condo_id, new_family)
  returning id into new_child;
  return new_child;
end;
$$;

-- A parent or adult student buys a package for a child they can see. Creates the invoice to pay in the portal.
create function public.buy_package(p_student_id uuid, p_package_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.is_staff() or not public.can_see_billing(p_student_id) then
    raise exception 'You cannot buy a package for this child.';
  end if;
  return public.make_invoice(
    p_student_id,
    p_package_id,
    true,
    public.malaysia_today(),
    case when exists (select 1 from public.student_packages where student_id = p_student_id) then 'renewal' else 'new' end
  );
end;
$$;

revoke execute on function public.public_condos() from public;
grant execute on function public.public_condos() to anon, authenticated;
revoke execute on function public.register_child(text, date, uuid) from anon;
revoke execute on function public.buy_package(uuid, uuid) from anon;
