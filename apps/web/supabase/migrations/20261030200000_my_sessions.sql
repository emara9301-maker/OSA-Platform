-- The sessions of the classes the account's student records (and its children) are enrolled in, with each student's attendance.
create function public.my_sessions()
returns table (session_id uuid, class_name text, starts_at timestamptz, ends_at timestamptz, session_status text, cancel_reason text, student_name text, attendance text, excused boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select se.id, c.name, se.starts_at, se.ends_at, se.status, se.cancel_reason, s.full_name, a.status, a.excused
  from public.class_enrolments e
  join public.students s on s.id = e.student_id
  join public.classes c on c.id = e.class_id
  join public.sessions se on se.class_id = c.id
  left join public.attendance a on a.session_id = se.id and a.student_id = s.id
  where (
      s.account_id = auth.uid()
      or exists (select 1 from public.family_guardians fg where fg.family_id = s.family_id and fg.profile_id = auth.uid())
    )
    and se.starts_at >= greatest(e.created_at, now() - interval '90 days')
    and se.starts_at <= now() + interval '90 days'
  order by se.starts_at;
$$;

revoke execute on function public.my_sessions() from public, anon;
grant execute on function public.my_sessions() to authenticated;
