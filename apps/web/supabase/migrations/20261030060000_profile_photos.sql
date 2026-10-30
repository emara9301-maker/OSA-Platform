-- Profile photos. The bucket is private: only the account itself and staff can read a photo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
);

-- Each account keeps its photos in a folder named after its own id.
create policy "members add own profile photo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "members remove own profile photo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "members and staff read profile photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_staff())
  );

alter table public.profiles add column avatar_path text;

-- Sets the photo of the signed-in account only. The path must start with that account's folder.
create function public.set_profile_photo(p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_path is null or split_part(p_path, '/', 1) <> auth.uid()::text then
    raise exception 'That photo is not yours.';
  end if;
  update public.profiles set avatar_path = p_path where id = auth.uid();
end;
$$;

revoke execute on function public.set_profile_photo(text) from public;
grant execute on function public.set_profile_photo(text) to authenticated;
