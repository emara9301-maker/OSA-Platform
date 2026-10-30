-- Lessons change only through server functions, so a cancellation always issues make-up tokens and notifies families.
-- Managers used to update sessions directly, which skipped those rules.
drop policy "managers cancel sessions" on public.sessions;
revoke update on public.sessions from authenticated;
