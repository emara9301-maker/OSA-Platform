-- A coach can always read the reports they wrote. Without this, writing a report and reading it back
-- in the same statement fails, because the check runs before the new row is visible to the lookup.
drop policy "see reports" on public.reports;

create policy "see reports" on public.reports for select to authenticated
  using (coach_id = auth.uid() or public.can_see_report(id));
