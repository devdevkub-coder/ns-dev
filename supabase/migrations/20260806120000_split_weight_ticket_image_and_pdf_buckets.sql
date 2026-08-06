-- Keep transaction evidence private and generated outbound PDF/album artifacts public.
-- Existing objects are intentionally not moved by SQL; use the guarded image-bucket
-- migration script before switching an environment to the new runtime contract.

insert into public.system_settings (key, description, value)
values
  ('WEIGHT_TICKET_IMAGE_BUCKET', 'Private Supabase Storage bucket for WTI/WTO evidence images', 'weight-ticket-images'),
  ('WEIGHT_TICKET_PDF_BUCKET', 'Public Supabase Storage bucket for generated WTI/WTO PDFs and LINE album artifacts', 'weight-ticket-pdfs')
on conflict (key) do update
set description = excluded.description,
    value = coalesce(nullif(trim(public.system_settings.value), ''), excluded.value);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'weight-ticket-images',
  'weight-ticket-images',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'weight-ticket-pdfs',
  'weight-ticket-pdfs',
  true,
  10485760,
  array['application/pdf', 'image/jpeg']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
