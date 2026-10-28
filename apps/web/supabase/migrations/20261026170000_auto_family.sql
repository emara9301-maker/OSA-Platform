-- Approving a link no longer needs a family first. A child without a family gets one automatically,
-- named after the child, and the guardian is linked to it. The guardian's own login keeps working either way.
create or replace function public.decide_guardian_link(p_request_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  req public.guardian_link_requests%rowtype;
  child public.students%rowtype;
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
    select * into child from public.students where id = req.student_id;

    if child.family_id is null then
      insert into public.families (name)
      values (child.full_name || ' family')
      returning id into child.family_id;

      update public.students set family_id = child.family_id where id = child.id;
    end if;

    insert into public.family_guardians (family_id, profile_id, relationship)
    values (child.family_id, req.requester_id, req.relationship)
    on conflict do nothing;
  end if;

  update public.guardian_link_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      decided_by = auth.uid(),
      decided_at = now()
  where id = p_request_id;
end;
$$;
