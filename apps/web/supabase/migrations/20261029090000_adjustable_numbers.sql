-- Numbers that were fixed in the code are now settings. Each keeps the value the code used, so nothing changes until OSA edits it.
insert into public.settings (key, value, label, unit) values
  ('make_up_search_days', 14, 'Days ahead to look for make-up times', 'days'),
  ('make_up_suggestion_count', 3, 'Make-up times offered to a family', 'times'),
  ('make_up_slot_step_minutes', 30, 'Gap between the make-up times offered', 'minutes'),
  ('schedule_window_days', 14, 'Days ahead shown on the schedule', 'days'),
  ('student_history_days', 14, 'Days back shown for a student''s recent lessons', 'days'),
  ('missing_report_days', 7, 'Days back to count missing lesson reports', 'days'),
  ('pause_max_days', 14, 'Longest pause allowed for a package (rules not built yet)', 'days'),
  ('grace_default_days', 7, 'Grace period offered by default when a manager allows one', 'days');

-- Staff (coaches included) read only the numbers that do not reveal money or pay.
create function public.staff_setting(p_key text)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Only staff can read this setting.';
  end if;
  if p_key not in (
    'schedule_window_days', 'student_history_days', 'missing_report_days',
    'make_up_search_days', 'make_up_suggestion_count', 'make_up_slot_step_minutes',
    'make_up_min_notice_hours', 'rain_hold_minutes'
  ) then
    raise exception 'This setting is not available to staff.';
  end if;
  return public.setting_value(p_key);
end;
$$;

revoke execute on function public.staff_setting(text) from anon;

-- The booking screen gets the search settings with the coach's busy times, so families need no access to settings.
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
      'search_days', public.setting_value('make_up_search_days'),
      'suggestion_count', public.setting_value('make_up_suggestion_count'),
      'slot_step_minutes', public.setting_value('make_up_slot_step_minutes'),
      'busy', coalesce((
        select jsonb_agg(jsonb_build_object('start', s.starts_at, 'end', s.ends_at))
        from public.sessions s
        join public.classes oc on oc.id = s.class_id
        where oc.coach_id = cl.coach_id
          and s.status in ('scheduled', 'paused')
          and s.ends_at > now()
          and s.starts_at < now() + make_interval(days => public.setting_value('make_up_search_days')::int)
      ), '[]'::jsonb)
    )
    from public.classes cl
    join public.condos co on co.id = cl.condo_id
    where cl.id = p_class_id
  ) end;
$$;
