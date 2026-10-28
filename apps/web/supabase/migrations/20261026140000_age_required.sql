-- Age is required at sign-up. The check is NOT VALID, so the two accounts created before this rule
-- keep working; they get checked the next time their row changes.
alter table public.profiles add column age integer;

alter table public.profiles
  add constraint profiles_age_range check (age between 1 and 120) not valid;

alter table public.profiles
  add constraint profiles_age_required check (age is not null) not valid;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, phone, username, age)
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
    nullif(new.raw_user_meta_data ->> 'age', '')::integer
  );
  return new;
end;
$$;
