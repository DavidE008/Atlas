create table public.mission_attachments (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  content_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index mission_attachments_mission_id_idx on public.mission_attachments(mission_id);
alter table public.mission_attachments enable row level security;
grant select on public.mission_attachments to anon, authenticated;
grant insert on public.mission_attachments to authenticated;
revoke update, delete on public.mission_attachments from anon, authenticated;

create policy "read visible mission references" on public.mission_attachments
  for select to anon, authenticated using (
    exists (select 1 from public.missions m where m.id = mission_id
      and (m.mission_address is not null or m.created_by = (select auth.uid())))
  );
create policy "sponsors attach to their drafts" on public.mission_attachments
  for insert to authenticated with check (
    exists (select 1 from public.missions m where m.id = mission_id
      and m.created_by = (select auth.uid()) and m.mission_address is null
      and storage_path like m.created_by::text || '/' || m.id::text || '/%')
    and exists (select 1 from storage.objects o
      where o.bucket_id = 'mission-references' and o.name = storage_path)
  );

-- Serialize attachment inserts for each mission to enforce limits under concurrency.
create function public.check_mission_attachment_limits() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.missions where id = new.mission_id for update;
  if (select count(*) from public.mission_attachments where mission_id = new.mission_id) >= 5
    or (select coalesce(sum(size_bytes), 0) from public.mission_attachments where mission_id = new.mission_id) + new.size_bytes > 26214400 then
    raise exception 'A mission supports up to 5 reference files totaling 25 MB';
  end if;
  return new;
end;
$$;
create trigger enforce_mission_attachment_limits before insert on public.mission_attachments
  for each row execute function public.check_mission_attachment_limits();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mission-references', 'mission-references', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);

create policy "read mission reference objects" on storage.objects for select to anon, authenticated
using (bucket_id = 'mission-references' and (
  (storage.foldername(name))[1] = (select auth.uid())::text
  or exists (select 1 from public.mission_attachments a where a.storage_path = name)
));
create policy "sponsors upload draft reference objects" on storage.objects for insert to authenticated
with check (bucket_id = 'mission-references'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.missions m
    where m.id::text = (storage.foldername(name))[2]
      and m.created_by = (select auth.uid()) and m.mission_address is null));
-- Attached files cannot be overwritten or deleted; only unfinished uploads can be cleaned up.
create policy "sponsors clean unattached reference uploads" on storage.objects for delete to authenticated
using (bucket_id = 'mission-references'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (select 1 from public.mission_attachments a where a.storage_path = name));
