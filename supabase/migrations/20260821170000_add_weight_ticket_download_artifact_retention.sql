insert into public.system_settings (key, description, value)
values (
  'WEIGHT_TICKET_IMAGE_DOWNLOAD_ARTIFACT_RETENTION_SECONDS',
  'Retention for private WTI/WTO ZIP download artifacts, independent from signed URL lifetime',
  '86400'
)
on conflict (key) do update
set description = excluded.description,
    value = case
      when nullif(trim(public.system_settings.value), '') is null then excluded.value
      else public.system_settings.value
    end;
