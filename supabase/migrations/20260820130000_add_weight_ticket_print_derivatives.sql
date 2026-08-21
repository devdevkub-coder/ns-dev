alter table public.weight_ticket_image_assets
  add column print_storage_key text,
  add column print_status text not null default 'queued',
  add column print_attempt_count integer not null default 0,
  add column print_next_retry_at timestamptz not null default now(),
  add column print_locked_at timestamptz,
  add column print_locked_by text,
  add column print_width integer,
  add column print_height integer,
  add column print_last_error text;

update public.weight_ticket_image_assets
set print_storage_key = format('attachments/migrated-print/%s.print.jpg', id);

do $$
begin
  if exists (
    select 1
    from public.weight_ticket_image_assets
    where print_storage_key is null
      or print_storage_key = ''
      or print_storage_key = original_storage_key
  ) then
    raise exception 'WTI/WTO print derivative migration blocked: an original storage key has no safe distinct print key';
  end if;

  if exists (
    select 1
    from public.weight_ticket_image_assets print_asset
    join public.weight_ticket_image_assets original_asset
      on original_asset.bucket = print_asset.bucket
     and original_asset.original_storage_key = print_asset.print_storage_key
  ) then
    raise exception 'WTI/WTO print derivative migration blocked: a print key collides with an original storage key';
  end if;

  if exists (
    select 1
    from public.weight_ticket_image_assets asset
    join storage.objects storage_object
      on storage_object.bucket_id = asset.bucket
     and storage_object.name = asset.print_storage_key
  ) then
    raise exception 'WTI/WTO print derivative migration blocked: a generated print key already exists in Storage';
  end if;
end $$;

alter table public.weight_ticket_image_assets
  alter column print_storage_key set not null;

alter table public.weight_ticket_image_assets
  add constraint weight_ticket_image_assets_print_status_check
    check (print_status in ('queued', 'processing', 'ready', 'failed')),
  add constraint weight_ticket_image_assets_print_attempt_count_check
    check (print_attempt_count >= 0),
  add constraint weight_ticket_image_assets_print_dimensions_check
    check (
      (print_width is null or print_width > 0)
      and (print_height is null or print_height > 0)
      and (print_width is null or print_width <= 400)
      and (print_height is null or print_height <= 400)
    ),
  add constraint weight_ticket_image_assets_print_key_nonempty
    check (print_storage_key <> ''),
  add constraint weight_ticket_image_assets_print_key_distinct
    check (print_storage_key <> original_storage_key);

do $$
begin
  if exists (
    select 1
    from public.weight_ticket_image_assets
    group by bucket, print_storage_key
    having count(*) > 1
  ) then
    raise exception 'WTI/WTO print derivative migration blocked: duplicate print storage keys exist';
  end if;
end $$;

create index weight_ticket_image_assets_print_pending_idx
  on public.weight_ticket_image_assets (print_status, print_next_retry_at);

create unique index weight_ticket_image_assets_print_idx
  on public.weight_ticket_image_assets (bucket, print_storage_key);

do $$
begin
  if exists (
    select 1
    from public.system_settings
    where key = 'WEIGHT_TICKET_PRINT_MAX_DIMENSION'
      and nullif(trim(value), '') is not null
      and case
        when trim(value) ~ '^[0-9]+$' then trim(value)::integer not between 1 and 400
        else true
      end
  ) then
    raise exception 'WTI/WTO print derivative migration blocked: print max dimension must be between 1 and 400';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from public.system_settings
    where key = 'WEIGHT_TICKET_PRINT_JPEG_QUALITY'
      and nullif(trim(value), '') is not null
      and case
        when trim(value) ~ '^[0-9]+$' then trim(value)::integer not between 1 and 100
        else true
      end
  ) then
      raise exception 'WTI/WTO print derivative migration blocked: print JPEG quality must be between 1 and 100';
  end if;
end $$;

insert into public.system_settings (key, description, value)
values
  ('WEIGHT_TICKET_PRINT_MAX_DIMENSION', 'Maximum width or height of generated WTI/WTO PDF/LINE print images in pixels', '400'),
  ('WEIGHT_TICKET_PRINT_JPEG_QUALITY', 'JPEG quality for WTI/WTO PDF/LINE print images from 1 to 100', '90')
on conflict (key) do update
set description = excluded.description,
    value = case
      when nullif(trim(public.system_settings.value), '') is null then excluded.value
      else public.system_settings.value
    end;
