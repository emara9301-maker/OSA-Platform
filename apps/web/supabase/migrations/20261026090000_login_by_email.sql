-- Login uses email and password only, so the username lookup is no longer needed.
drop function public.email_for_username(text);

-- A new account's display name is its username when it has one, not the email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, phone, username)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'username',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'username'
  );
  return new;
end;
$$;
