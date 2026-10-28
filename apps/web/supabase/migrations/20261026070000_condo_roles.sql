-- Owner and department heads manage condos (add, edit, delete). Coaches only read them.
drop policy "owner and coaches add condos" on public.condos;
drop policy "owner and coaches edit condos" on public.condos;

create policy "owner and department heads add condos"
  on public.condos for insert
  to authenticated
  with check (public.current_account_role() in ('owner', 'department_head'));

create policy "owner and department heads edit condos"
  on public.condos for update
  to authenticated
  using (public.current_account_role() in ('owner', 'department_head'))
  with check (public.current_account_role() in ('owner', 'department_head'));

grant delete on public.condos to authenticated;

create policy "owner and department heads delete condos"
  on public.condos for delete
  to authenticated
  using (public.current_account_role() in ('owner', 'department_head'));
