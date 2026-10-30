-- The condo of the latest purchase (paid or not yet paid). Children count through their family.
create or replace function public.my_condo_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pl.condo_id
  from public.invoices i
  join public.students s on s.id = i.student_id
  join public.packages p on p.id = i.package_id
  join public.pools pl on pl.id = p.pool_id
  where i.status <> 'void'
    and (
      s.account_id = auth.uid()
      or exists (select 1 from public.family_guardians fg where fg.family_id = s.family_id and fg.profile_id = auth.uid())
    )
  order by i.created_at desc
  limit 1;
$$;
