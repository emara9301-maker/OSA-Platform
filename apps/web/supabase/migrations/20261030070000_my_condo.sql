-- The condo of the account's latest package that runs today. Children count through their family.
create function public.my_condo_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pl.condo_id
  from public.student_packages sp
  join public.students s on s.id = sp.student_id
  join public.packages p on p.id = sp.package_id
  join public.pools pl on pl.id = p.pool_id
  where (
      s.account_id = auth.uid()
      or exists (select 1 from public.family_guardians fg where fg.family_id = s.family_id and fg.profile_id = auth.uid())
    )
    and sp.starts_on <= (now() at time zone 'Asia/Kuala_Lumpur')::date
    and sp.ends_on >= (now() at time zone 'Asia/Kuala_Lumpur')::date
  order by sp.created_at desc
  limit 1;
$$;

revoke execute on function public.my_condo_id() from public;
grant execute on function public.my_condo_id() to authenticated;

-- The condo page for its members: contact details, and each pool's hours, rules and how to get in. Null when there is none.
create function public.my_condo_details()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'area', c.area,
    'address', c.address,
    'contact_phone', c.contact_phone,
    'pools', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', pl.id,
            'name', pl.name,
            'pool_hours', pl.pool_hours,
            'rules', pl.rules,
            'access_notes', pl.access_notes,
            'image_url', pl.image_url
          )
          order by pl.sort_order
        )
        from public.pools pl
        where pl.condo_id = c.id
      ),
      '[]'::jsonb
    )
  )
  from public.condos c
  where c.id = public.my_condo_id();
$$;

revoke execute on function public.my_condo_details() from public;
grant execute on function public.my_condo_details() to authenticated;
