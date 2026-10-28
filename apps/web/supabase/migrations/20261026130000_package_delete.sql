-- The owner and department heads can delete a package. The deletion is recorded in the audit log.
grant delete on public.packages to authenticated;

create policy "owner and department heads delete packages"
  on public.packages for delete
  to authenticated
  using (public.current_account_role() in ('owner', 'department_head'));
