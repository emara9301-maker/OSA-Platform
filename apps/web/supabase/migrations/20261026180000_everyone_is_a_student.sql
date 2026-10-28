-- Every new account is a student. Sign-up creates the student record with the name and date of birth.
-- The student has no condo or family until staff set them, so condo_id becomes optional.
-- Any account can ask to be linked to a child by QR code, so the account_kind flag is no longer needed.

alter table public.students alter column condo_id drop not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dob date := nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date;
  display_name text := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'username',
    split_part(new.email, '@', 1)
  );
begin
  insert into public.profiles (id, email, full_name, phone, username, age)
  values (
    new.id,
    new.email,
    display_name,
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'username',
    coalesce(
      nullif(new.raw_user_meta_data ->> 'age', '')::integer,
      case when dob is not null then extract(year from age(current_date, dob))::integer end
    )
  );

  -- A self-registered account gets its own student record, unless it came from staff tooling without a date of birth.
  if dob is not null and new.raw_user_meta_data ->> 'full_name' is not null then
    insert into public.students (account_id, full_name, date_of_birth)
    values (new.id, new.raw_user_meta_data ->> 'full_name', dob);
  end if;

  return new;
end;
$$;

-- Any account can request a link, not only guardian accounts.
create or replace function public.request_guardian_link(p_token uuid, p_relationship text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  child public.students%rowtype;
  new_id uuid;
begin
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

alter table public.profiles drop column account_kind;
drop type public.account_kind;
