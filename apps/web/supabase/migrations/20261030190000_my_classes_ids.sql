-- The account's classes now carry the class and student ids, so the pool page can show which of them are already joined.
drop function public.my_classes();

create function public.my_classes()
returns table (class_id uuid, student_id uuid, student_name text, class_name text, weekday integer, start_time time, duration_minutes integer, coach_name text, pool_name text, condo_name text, enrolled integer, capacity integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, s.id, s.full_name, c.name, c.weekday, c.start_time, c.duration_minutes,
    coalesce(nullif(trim(pr.full_name), ''), pr.username),
    p.name, co.name,
    (select count(*)::int from public.class_enrolments e2 where e2.class_id = c.id),
    c.capacity
  from public.class_enrolments e
  join public.students s on s.id = e.student_id
  join public.classes c on c.id = e.class_id
  left join public.profiles pr on pr.id = c.coach_id
  left join public.pools p on p.id = c.pool_id
  left join public.condos co on co.id = c.condo_id
  where (
      s.account_id = auth.uid()
      or exists (select 1 from public.family_guardians fg where fg.family_id = s.family_id and fg.profile_id = auth.uid())
    )
    and c.end_date >= public.malaysia_today()
  order by c.weekday, c.start_time;
$$;

revoke execute on function public.my_classes() from public, anon;
grant execute on function public.my_classes() to authenticated;
