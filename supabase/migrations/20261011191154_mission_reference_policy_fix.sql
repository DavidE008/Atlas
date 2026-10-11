-- Keep cross-table storage checks out of RLS policy expansion to avoid recursion.
alter policy "sponsors attach to their drafts" on public.mission_attachments
with check (
  exists (select 1 from public.missions m where m.id = mission_id
    and m.created_by = (select auth.uid()) and m.mission_address is null
    and storage_path like m.created_by::text || '/' || m.id::text || '/%')
);

create or replace function public.check_mission_attachment_limits() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.missions where id = new.mission_id for update;
  if not exists (select 1 from storage.objects o
    where o.bucket_id = 'mission-references' and o.name = new.storage_path) then
    raise exception 'Upload the reference file before attaching it';
  end if;
  if (select count(*) from public.mission_attachments where mission_id = new.mission_id) >= 5
    or (select coalesce(sum(size_bytes), 0) from public.mission_attachments where mission_id = new.mission_id) + new.size_bytes > 26214400 then
    raise exception 'A mission supports up to 5 reference files totaling 25 MB';
  end if;
  return new;
end;
$$;
