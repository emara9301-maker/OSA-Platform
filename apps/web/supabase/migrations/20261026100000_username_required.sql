-- Every new account needs a username. NOT VALID checks new and changed rows only,
-- so the two accounts created before this rule keep working until they get a username.
alter table public.profiles
  add constraint profiles_username_required
  check (username is not null) not valid;
