-- Public condo list now includes each condo's location, so visitors can find the condos nearest to them.
drop function public.public_condos();

create function public.public_condos()
returns table (id uuid, name text, area text, image_url text, pool_count integer, latitude numeric, longitude numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.area, c.image_url,
    (select count(*)::int from public.pools p where p.condo_id = c.id),
    c.latitude, c.longitude
  from public.condos c
  where c.status = 'ready'
  order by c.name;
$$;

revoke execute on function public.public_condos() from public;
grant execute on function public.public_condos() to anon, authenticated;
