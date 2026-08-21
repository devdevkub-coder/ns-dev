-- Keep WTI/WTO evidence private while allowing request-created ZIP artifacts
-- to live in the same private bucket and use the existing signed-URL contract.
-- The application still bounds each archive part to 16 MiB before upload.

update storage.buckets
set
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/zip']
where id = 'weight-ticket-images';

do $$
begin
  if not exists (
    select 1
    from storage.buckets
    where id = 'weight-ticket-images'
      and public = false
      and file_size_limit = 20971520
      and allowed_mime_types @> array['application/zip']::text[]
  ) then
    raise exception 'weight-ticket-images bucket contract was not updated';
  end if;
end
$$;
