-- Pool photos. The bucket is public so visitors see them. Only the owner and department heads change them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pool-images',
  'pool-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
);

create policy "managers upload pool images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'pool-images'
    and public.current_account_role() in ('owner', 'department_head')
  );

create policy "managers replace pool images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'pool-images'
    and public.current_account_role() in ('owner', 'department_head')
  );

create policy "managers remove pool images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'pool-images'
    and public.current_account_role() in ('owner', 'department_head')
  );

alter table public.condos add column image_url text;

-- What the pools list on the home page shows: the name, area, photo and opening hours of each ready pool.
drop function public.public_condos();

create function public.public_condos()
returns table (id uuid, name text, area text, image_url text, pool_hours text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.area, c.image_url, c.pool_hours from public.condos c where c.status = 'ready' order by c.name;
$$;

revoke execute on function public.public_condos() from public;
grant execute on function public.public_condos() to anon, authenticated;

-- Pool details now include the photo and the opening hours.
create or replace function public.public_pool_details(p_condo_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'image_url', c.image_url,
    'pool_hours', c.pool_hours,
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object('label', f.label, 'value', v.value) order by f.sort_order)
      from public.pool_fields f
      cross join lateral (
        select case f.key
          when 'area' then c.area
          when 'address' then c.address
          when 'pool_hours' then c.pool_hours
          when 'contact_phone' then c.contact_phone
          when 'rules' then c.rules
          when 'access_notes' then c.access_notes
          when 'map' then case when c.latitude is not null and c.longitude is not null
            then c.latitude::text || ',' || c.longitude::text end
        end as value
      ) v
      where f.visible and nullif(trim(v.value), '') is not null
    ), '[]'::jsonb),
    'extras', coalesce((
      select jsonb_agg(jsonb_build_object('label', d.label, 'value', d.value) order by d.sort_order, d.created_at)
      from public.condo_details d
      where d.condo_id = c.id and d.visible
    ), '[]'::jsonb)
  )
  from public.condos c
  where c.id = p_condo_id and c.status = 'ready';
$$;

grant execute on function public.public_pool_details(uuid) to anon, authenticated;
