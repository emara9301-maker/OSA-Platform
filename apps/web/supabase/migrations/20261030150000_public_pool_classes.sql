-- The class times of a pool, for visitors: the class name, day, start time, length and the coach's name. No student details.
create function public.public_pool_classes(p_pool_id uuid)
returns table (name text, weekday integer, start_time time, duration_minutes integer, coach_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.name, c.weekday, c.start_time, c.duration_minutes,
    coalesce(nullif(trim(pr.full_name), ''), pr.username)
  from public.classes c
  left join public.profiles pr on pr.id = c.coach_id
  where c.pool_id = p_pool_id
    and c.is_active
    and c.end_date >= public.malaysia_today()
  order by c.weekday, c.start_time;
$$;

revoke execute on function public.public_pool_classes(uuid) from public;
grant execute on function public.public_pool_classes(uuid) to anon, authenticated;
