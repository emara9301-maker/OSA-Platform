-- Condo chat. Anyone with a purchase at the condo can write; managers can read and delete. Messages expire after the retention setting.
insert into public.settings (key, value, label, unit) values
  ('chat_retention_days', 15, 'How long condo chat messages are kept', 'days');

create table public.condo_messages (
  id uuid primary key default gen_random_uuid(),
  condo_id uuid not null references public.condos (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index condo_messages_condo_time on public.condo_messages (condo_id, created_at);

alter table public.condo_messages enable row level security;

-- A family or student with a purchase at this condo, directly or through a child.
create function public.is_condo_member(p_condo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.invoices i
    join public.students s on s.id = i.student_id
    join public.packages p on p.id = i.package_id
    join public.pools pl on pl.id = p.pool_id
    where pl.condo_id = p_condo_id
      and i.status <> 'void'
      and (
        s.account_id = auth.uid()
        or exists (select 1 from public.family_guardians fg where fg.family_id = s.family_id and fg.profile_id = auth.uid())
      )
  );
$$;

-- Members and managers may read the table directly (this also lets live updates reach them). Nobody writes it directly.
create policy "members and managers read condo messages"
  on public.condo_messages for select
  to authenticated
  using (
    public.is_condo_member(condo_id)
    or public.current_account_role() in ('owner', 'department_head')
  );

-- The messages shown in a chat: the author's username and photo path only, newest 100 inside the retention period.
create function public.list_condo_messages(p_condo_id uuid)
returns table (id uuid, author_id uuid, username text, avatar_path text, body text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.author_id, p.username, p.avatar_path, m.body, m.created_at
  from public.condo_messages m
  join public.profiles p on p.id = m.author_id
  where m.condo_id = p_condo_id
    and (public.is_condo_member(p_condo_id) or public.current_account_role() in ('owner', 'department_head'))
    and m.created_at >= now() - make_interval(days => public.setting_value('chat_retention_days')::int)
  order by m.created_at desc
  limit 100;
$$;

create function public.post_condo_message(p_condo_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not public.is_condo_member(p_condo_id) then
    raise exception 'Only families with a package at this condo can write here.';
  end if;

  -- Old messages are removed whenever someone writes, across all condos.
  delete from public.condo_messages
  where created_at < now() - make_interval(days => public.setting_value('chat_retention_days')::int);

  insert into public.condo_messages (condo_id, author_id, body)
  values (p_condo_id, auth.uid(), btrim(p_body))
  returning id into new_id;

  return new_id;
end;
$$;

create function public.delete_condo_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_account_role() not in ('owner', 'department_head') then
    raise exception 'Only the owner and department heads can delete chat messages.';
  end if;
  delete from public.condo_messages where id = p_message_id;
end;
$$;

revoke execute on function public.is_condo_member(uuid) from public, anon;
revoke execute on function public.list_condo_messages(uuid) from public, anon;
revoke execute on function public.post_condo_message(uuid, text) from public, anon;
revoke execute on function public.delete_condo_message(uuid) from public, anon;
grant execute on function public.list_condo_messages(uuid) to authenticated;
grant execute on function public.post_condo_message(uuid, text) to authenticated;
grant execute on function public.delete_condo_message(uuid) to authenticated;

-- A chat member may see the photo of anyone who has written in a chat they can read.
create function public.can_read_profile_photo(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.condo_messages m on m.author_id = p.id
    where p.avatar_path = p_path
      and (public.is_condo_member(m.condo_id) or public.current_account_role() in ('owner', 'department_head'))
  );
$$;

revoke execute on function public.can_read_profile_photo(text) from public, anon;
grant execute on function public.can_read_profile_photo(text) to authenticated;

drop policy "members and staff read profile photos" on storage.objects;

create policy "members, staff and chat members read profile photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_staff()
      or public.can_read_profile_photo(name)
    )
  );

alter publication supabase_realtime add table public.condo_messages;
