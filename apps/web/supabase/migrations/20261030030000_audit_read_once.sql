-- The role is checked once per query, not once per audit row. The log is long, so a per-row check is slow.
drop policy "owner and department heads read the audit log" on public.audit_log;

create policy "owner and department heads read the audit log"
  on public.audit_log for select
  to authenticated
  using ((select public.current_account_role()) in ('owner', 'department_head'));
