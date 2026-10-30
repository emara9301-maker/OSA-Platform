-- A student who pays for a package becomes active. A paused or left student keeps its status.
create function public.activate_student_on_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.students set status = 'active' where id = new.student_id and status in ('lead', 'trial');
  return new;
end;
$$;

create trigger invoices_activate_student
  after update of status on public.invoices
  for each row
  when (new.status = 'paid' and old.status is distinct from 'paid')
  execute function public.activate_student_on_payment();
