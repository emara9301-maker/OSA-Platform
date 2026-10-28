-- Parent and guardian accounts. A guardian asks to be linked to a child by scanning the child's QR code.
-- Owner and department heads approve or reject the request. Approval adds the guardian to the child's family.

create type public.account_kind as enum ('student', 'guardian');

alter table public.profiles add column account_kind public.account_kind not null default 'student';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, phone, username, age, account_kind)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'username',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'username',
    nullif(new.raw_user_meta_data ->> 'age', '')::integer,
    case
      when new.raw_user_meta_data ->> 'account_kind' = 'guardian' then 'guardian'::public.account_kind
      else 'student'::public.account_kind
    end
  );
  return new;
end;
$$;

create table public.guardian_link_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  relationship text not null check (length(trim(relationship)) > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index guardian_link_requests_one_pending
  on public.guardian_link_requests (requester_id, student_id)
  where status = 'pending';

alter table public.guardian_link_requests enable row level security;
revoke all on public.guardian_link_requests from anon;
revoke insert, update, delete on public.guardian_link_requests from authenticated;

create policy "managers and the requester read link requests"
  on public.guardian_link_requests for select
  to authenticated
  using (
    coalesce(public.current_account_role() in ('owner', 'department_head'), false)
    or requester_id = auth.uid()
  );

create trigger guardian_link_requests_audit
  after insert or update on public.guardian_link_requests
  for each row execute function public.write_audit_log();

-- A guardian scans or types a child's QR code. The request is stored as pending.
create function public.request_guardian_link(p_token uuid, p_relationship text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  child public.students%rowtype;
  new_id uuid;
begin
  if (select account_kind from public.profiles where id = auth.uid()) is distinct from 'guardian' then
    raise exception 'Only parent or guardian accounts can request a link.';
  end if;

  select * into child from public.students where qr_token = p_token;
  if not found then
    raise exception 'No child matches this QR code.';
  end if;

  if child.family_id is not null and exists (
    select 1 from public.family_guardians fg
    where fg.family_id = child.family_id and fg.profile_id = auth.uid()
  ) then
    raise exception 'You are already linked to this child.';
  end if;

  insert into public.guardian_link_requests (requester_id, student_id, relationship)
  values (auth.uid(), child.id, trim(p_relationship))
  returning id into new_id;

  return new_id;
exception
  when unique_violation then
    raise exception 'You already have a pending request for this child.';
end;
$$;

-- Owner and department heads approve or reject. Approval links the guardian to the child's family.
create function public.decide_guardian_link(p_request_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  req public.guardian_link_requests%rowtype;
  child_family uuid;
begin
  if not coalesce(public.current_account_role() in ('owner', 'department_head'), false) then
    raise exception 'Only the owner and department heads can decide link requests.';
  end if;

  select * into req from public.guardian_link_requests
  where id = p_request_id and status = 'pending';
  if not found then
    raise exception 'This request is no longer pending.';
  end if;

  if p_approve then
    select family_id into child_family from public.students where id = req.student_id;
    if child_family is null then
      raise exception 'This child is not in a family yet. Add the child to a family first.';
    end if;

    insert into public.family_guardians (family_id, profile_id, relationship)
    values (child_family, req.requester_id, req.relationship)
    on conflict do nothing;
  end if;

  update public.guardian_link_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      decided_by = auth.uid(),
      decided_at = now()
  where id = p_request_id;
end;
$$;

revoke all on function public.request_guardian_link(uuid, text) from public, anon;
grant execute on function public.request_guardian_link(uuid, text) to authenticated;

revoke all on function public.decide_guardian_link(uuid, boolean) from public, anon;
grant execute on function public.decide_guardian_link(uuid, boolean) to authenticated;
