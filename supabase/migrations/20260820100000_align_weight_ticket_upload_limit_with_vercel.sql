UPDATE public.system_settings
SET value = '4194304'
WHERE key = 'WEIGHT_TICKET_IMAGE_MAX_UPLOAD_BYTES'
  AND value::bigint > 4194304;
