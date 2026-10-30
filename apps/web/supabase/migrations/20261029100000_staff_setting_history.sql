-- Staff may also read how far back a student's recent lessons go.
create or replace function public.staff_setting(p_key text)
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
