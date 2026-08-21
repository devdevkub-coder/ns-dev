update public.system_settings
set value = '100',
    description = 'JPEG quality for downloadable WTI/WTO image derivatives'
where key = 'WEIGHT_TICKET_DOWNLOAD_JPEG_QUALITY';

do $$
begin
  if not exists (
    select 1
    from public.system_settings
    where key = 'WEIGHT_TICKET_DOWNLOAD_JPEG_QUALITY'
      and value = '100'
  ) then
    raise exception 'WEIGHT_TICKET_DOWNLOAD_JPEG_QUALITY setting is missing';
  end if;
end $$;
