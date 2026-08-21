-- Keep private WTI/WTO image and ZIP artifacts within the same bucket contract.
-- ZIP parts are bounded by the application at 16 MiB; 50 MiB leaves upload
-- headroom without changing the private bucket boundary.

update storage.buckets
set
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/zip']
where id = 'weight-ticket-images';

do $$
begin
  if not exists (
    select 1
    from storage.buckets
    where id = 'weight-ticket-images'
      and public = false
      and file_size_limit = 52428800
      and allowed_mime_types @> array['application/zip']::text[]
  ) then
    raise exception 'weight-ticket-images bucket archive limit was not updated';
  end if;
end
$$;
