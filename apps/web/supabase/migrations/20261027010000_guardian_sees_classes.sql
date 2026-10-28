-- A class is visible to anyone who may see one of its enrolled students (for example a guardian).
-- can_see_student does not call can_see_class, so there is no recursion.
create or replace function public.can_see_class(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_account_role() in ('owner', 'department_head'), false)
    or exists (select 1 from public.classes c where c.id = cid and c.coach_id = auth.uid())
    or exists (
      select 1 from public.class_enrolments ce
      where ce.class_id = cid and public.can_see_student(ce.student_id)
    );
$$;
