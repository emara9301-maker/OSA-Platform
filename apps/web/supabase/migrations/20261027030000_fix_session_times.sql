-- Sessions were generated from timestamptz dates, so a 17:00 Malaysian lesson landed on the wrong day and hour.
-- The dates are now plain timestamps, converted to Malaysian time once. Scheduled sessions are regenerated.
create or replace function public.generate_sessions(p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.classes%rowtype;
begin
  select * into c from public.classes where id = p_class_id;

  insert into public.sessions (class_id, starts_at, ends_at)
  select
    c.id,
    (d + c.start_time) at time zone 'Asia/Kuala_Lumpur',
    ((d + c.start_time) at time zone 'Asia/Kuala_Lumpur') + make_interval(mins => c.duration_minutes)
  from generate_series(c.start_date::timestamp, c.end_date::timestamp, interval '1 day') as d
  where extract(isodow from d) = c.weekday
  on conflict (class_id, starts_at) do nothing;
end;
$$;

-- Remove wrongly placed scheduled sessions (lessons with attendance or a cancellation are kept),
-- then generate the correct ones again.
delete from public.sessions s
where s.status = 'scheduled'
  and not exists (select 1 from public.attendance a where a.session_id = s.id);

select public.generate_sessions(id) from public.classes;
