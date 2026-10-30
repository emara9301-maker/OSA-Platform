-- Only families (student accounts) read active packages when signed in. Coaches and other staff keep their own rules.
drop policy "signed-in read active packages" on public.packages;
create policy "families read active packages" on public.packages for select to authenticated
  using (is_active and public.current_account_role() = 'student');
