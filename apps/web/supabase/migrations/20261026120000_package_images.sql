-- Package photos. The bucket is public so the website can show them; only the owner and
-- department heads can upload, replace or remove a file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'package-images',
  'package-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
);

create policy "owner and department heads upload package images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'package-images'
    and public.current_account_role() in ('owner', 'department_head')
  );

create policy "owner and department heads replace package images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'package-images'
    and public.current_account_role() in ('owner', 'department_head')
  );

create policy "owner and department heads remove package images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'package-images'
    and public.current_account_role() in ('owner', 'department_head')
  );
