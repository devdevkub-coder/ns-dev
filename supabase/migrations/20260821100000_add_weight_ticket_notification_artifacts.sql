alter table public.weight_ticket_notification_logs
  add column if not exists artifact_storage_keys jsonb;

comment on column public.weight_ticket_notification_logs.artifact_storage_keys is
  'Outbound PDF/LINE album artifact keys generated for this notification attempt; source evidence is never stored here.';
