-- Part 0: a single function the web app calls to prove it can read the database.
create or replace function public.health_check()
returns timestamptz
language sql
stable
as $$
  select now();
$$;

grant execute on function public.health_check() to anon, authenticated;
