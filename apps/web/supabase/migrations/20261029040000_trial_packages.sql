-- Trial packages until OSA sends its price list. Staff edit or delete them on the Packages page.
-- Visitors see only active packages on the public site, and never the audit or internal fields.

insert into public.packages (name, short_pitch, type, sessions_count, session_minutes, validity_days, price, is_active) values
  ('Trial: Private 1-to-1', 'One coach, one child, every lesson is yours.', 'private_1_1', 8, 45, 30, 400, true),
  ('Trial: Semi-private 1-to-2', 'One coach, two children sharing the lesson.', 'semi_private_1_2', 8, 45, 30, 300, true),
  ('Trial: Small group', 'Up to four children in one class.', 'small_group', 8, 60, 30, 200, true),
  ('Trial: Adult', 'Lessons for adults who want to learn or improve.', 'adult', 8, 60, 30, 250, true);

create policy "visitors read active packages" on public.packages for select to anon
  using (is_active);
grant select on public.packages to anon;
