-- Signed-in families can read active packages too, so they can buy one. Inactive packages stay staff-only.
create policy "signed-in read active packages" on public.packages for select to authenticated
  using (is_active);
