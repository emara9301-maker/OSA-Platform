-- Every package belongs to one pool, with its own price. A pool's packages show only on that pool.
-- Packages that were never bought are deleted. A package already on an invoice or a running period is kept
-- for the billing history, and is switched off.
delete from public.packages p
where not exists (select 1 from public.invoices i where i.package_id = p.id)
  and not exists (select 1 from public.student_packages sp where sp.package_id = p.id);

update public.packages set is_active = false;

alter table public.packages add column condo_id uuid references public.condos (id) on delete restrict;

-- An active package must belong to a pool. Kept history may have no pool.
alter table public.packages add constraint packages_active_needs_pool
  check (condo_id is not null or is_active = false);

-- A package can only be bought for a child at the same pool.
create or replace function public.make_invoice(
  p_student_id uuid,
  p_package_id uuid,
  p_carry_over boolean,
  p_due_on date,
  p_kind text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pkg public.packages%rowtype;
  stu public.students%rowtype;
  discount numeric := 0;
  new_id uuid;
begin
  select * into pkg from public.packages where id = p_package_id and is_active;
  if not found then
    raise exception 'Package not found.';
  end if;
  if pkg.price is null then
    raise exception 'This package has no price yet.';
  end if;
  select * into stu from public.students where id = p_student_id;
  if not found then
    raise exception 'Student not found.';
  end if;
  if pkg.condo_id is distinct from stu.condo_id then
    raise exception 'This package is not offered at this pool.';
  end if;

  if stu.family_id is not null and exists (
    select 1
    from public.students sib
    join public.student_packages sp on sp.student_id = sib.id
    where sib.family_id = stu.family_id
      and sib.id <> stu.id
      and sp.starts_on <= public.malaysia_today()
      and sp.ends_on >= public.malaysia_today()
  ) then
    discount := public.setting_value('sibling_discount_percent');
  end if;

  insert into public.invoices (student_id, package_id, kind, amount, discount_percent, carry_over, due_on)
  values (stu.id, pkg.id, p_kind, round(pkg.price * (100 - discount) / 100, 2), discount, p_carry_over, p_due_on)
  returning id into new_id;

  perform public.notify_students(
    array[stu.id],
    null,
    format('Invoice for %s, due %s.', pkg.name, to_char(p_due_on, 'DD Mon YYYY'))
  );
  return new_id;
end;
$$;
