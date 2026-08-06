-- Retire the obsolete Google Sheets setting after WTI/WTO stopped syncing to Sheets.
-- Keep the original migration immutable; this removes only the unused config row.
delete from public.system_settings
where key = 'GOOGLE_SHEETS_WEBHOOK_URL';
