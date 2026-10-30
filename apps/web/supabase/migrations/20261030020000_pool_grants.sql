-- Managers' changes to pools are limited by the row policies. The table itself must be writable for signed-in users.
grant insert, update, delete on public.pools to authenticated;
