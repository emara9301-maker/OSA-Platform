-- The booking screen needs the minimum notice for a make-up. Families cannot read settings, so the context carries it.
create or replace function public.make_up_schedule_context(p_class_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (
    select 1 from public.make_up_tokens t
    where t.class_id = p_class_id and t.status = 'open' and public.can_see_billing(t.student_id)
  ) then (
    select jsonb_build_object(
      'pool_hours', co.pool_hours,
      'duration_minutes', cl.duration_minutes,
      'min_notice_hours', public.setting_value('make_up_min_notice_hours'),
      'busy', coalesce((
        select jsonb_agg(jsonb_build_object('start', s.starts_at, 'end', s.ends_at))
        from public.sessions s
        join public.classes oc on oc.id = s.class_id
        where oc.coach_id = cl.coach_id
          and s.status in ('scheduled', 'paused')
          and s.ends_at > now()
          and s.starts_at < now() + interval '14 days'
      ), '[]'::jsonb)
    )
    from public.classes cl
    join public.condos co on co.id = cl.condo_id
    where cl.id = p_class_id
  ) end;
$$;
