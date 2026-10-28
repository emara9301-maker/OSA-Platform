-- Audit log: every change to condos and to account roles is written here by a trigger.
-- Clients can read it (owner and department heads only) but never write or change it.
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('insert', 'update', 'delete')),
  table_name text not null,
  record_id text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

create policy "owner and department heads read the audit log"
  on public.audit_log for select
  to authenticated
  using (public.current_account_role() in ('owner', 'department_head'));

create function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (actor_id, action, table_name, record_id, before_data, after_data)
  values (
    auth.uid(),
    lower(TG_OP),
    TG_TABLE_NAME,
    coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id'),
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_profile_role
  after update of role on public.profiles
  for each row
  when (old.role is distinct from new.role)
  execute function public.write_audit_log();
