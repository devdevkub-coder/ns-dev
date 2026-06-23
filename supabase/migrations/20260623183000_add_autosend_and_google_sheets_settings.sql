-- Insert LINE_AUTO_SEND and GOOGLE_SHEETS_WEBHOOK_URL config keys if not already exists
insert into public.system_settings (key, description, value) values
  ('LINE_AUTO_SEND', 'Enable automatic LINE notifications on weight ticket creation', 'false'),
  ('GOOGLE_SHEETS_WEBHOOK_URL', 'Google Sheets Apps Script Webhook URL for data stream integration', null)
on conflict (key) do nothing;
