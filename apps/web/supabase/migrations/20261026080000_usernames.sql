-- Usernames: 3 to 20 letters, digits or underscores, unique regardless of case.
alter table public.profiles add column username text;

alter table public.profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[A-Za-z0-9_]{3,20}$');

create unique index profiles_username_key on public.profiles (lower(username));

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
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'username'
  );
  return new;
end;
$$;

-- Used by the login form to turn a username into the email that Supabase needs.
create function public.email_for_username(name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select email from public.profiles
  where lower(username) = lower(name) and is_active
  limit 1;
$$;

-- Used by the sign-up form to check a username before creating the account.
create function public.is_username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(name));
$$;

revoke all on function public.email_for_username(text) from public;
grant execute on function public.email_for_username(text) to anon, authenticated;

revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;
