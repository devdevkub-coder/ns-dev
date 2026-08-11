lock table public.weight_tickets, public.weight_ticket_lines in share row exclusive mode;

do $$
declare
  source_record record;
  row_record record;
  image_record record;
  image_json jsonb;
  image_values text[];
  image_bucket text;
  image_file_name text;
  image_storage_key text;
  image_thumbnail_key text;
  candidate_buckets text[];
begin
  for source_record in
    select 'weight_tickets'::text as table_name, 'vehicle_image_names'::text as image_column
    union all
    select 'weight_ticket_lines', 'image_names'
  loop
    for row_record in execute format(
      'select id, %I as image_values from public.%I where %I is not null',
      source_record.image_column,
      source_record.table_name,
      source_record.image_column
    )
    loop
      image_values := array[]::text[];

      for image_record in
        select value
        from unnest(row_record.image_values) with ordinality as values(value, position)
        order by position
      loop
        begin
          image_json := image_record.value::jsonb;
        exception when others then
          raise exception 'WTI/WTO image reconciliation blocked: invalid JSON image reference';
        end;

        if jsonb_typeof(image_json) <> 'object' then
          raise exception 'WTI/WTO image reconciliation blocked: image reference is not an object';
        end if;

        image_bucket := nullif(trim(image_json ->> 'bucket'), '');
        image_file_name := nullif(trim(image_json ->> 'fileName'), '');
        image_storage_key := nullif(trim(image_json ->> 'storageKey'), '');
        image_thumbnail_key := nullif(trim(image_json ->> 'thumbnailStorageKey'), '');

        if image_file_name is null or image_storage_key is null then
          raise exception 'WTI/WTO image reconciliation blocked: missing fileName/storageKey';
        end if;

        if image_bucket is null then
          select array_agg(distinct bucket_id order by bucket_id)
          into candidate_buckets
          from storage.objects
          where name = image_storage_key;

          if coalesce(array_length(candidate_buckets, 1), 0) <> 1 then
            raise exception 'WTI/WTO image reconciliation blocked: storageKey does not resolve to exactly one bucket';
          end if;

          image_bucket := candidate_buckets[1];
        end if;

        if not exists (
          select 1 from storage.objects
          where bucket_id = image_bucket and name = image_storage_key
        ) then
          raise exception 'WTI/WTO image reconciliation blocked: original object is missing';
        end if;

        if image_thumbnail_key is null then
          image_thumbnail_key := case
            when image_storage_key ~ '\\.[^./]+$'
              then regexp_replace(image_storage_key, '\\.[^./]+$', '.thumb.webp')
            else image_storage_key || '.thumb.webp'
          end;
        end if;

        image_values := array_append(
          image_values,
          jsonb_build_object(
            'fileName', image_file_name,
            'bucket', image_bucket,
            'storageKey', image_storage_key,
            'thumbnailStorageKey', image_thumbnail_key
          )::text
        );
      end loop;

      execute format(
        'update public.%I set %I = $1 where id = $2',
        source_record.table_name,
        source_record.image_column
      ) using image_values, row_record.id;
    end loop;
  end loop;
end $$;

with image_references as (
  select wt.id as ticket_id, image.value::jsonb as image_json
  from public.weight_tickets wt
  cross join lateral unnest(wt.vehicle_image_names) as image(value)
  union all
  select wtl.weight_ticket_id, image.value::jsonb
  from public.weight_ticket_lines wtl
  cross join lateral unnest(wtl.image_names) as image(value)
), distinct_references as (
  select distinct on (image_json ->> 'bucket', image_json ->> 'storageKey')
    ticket_id,
    image_json
  from image_references
  order by image_json ->> 'bucket', image_json ->> 'storageKey', ticket_id
)
insert into public.weight_ticket_image_assets (
  bucket,
  original_storage_key,
  thumbnail_storage_key,
  file_name,
  thumbnail_status,
  attached_ticket_id,
  attached_at
)
select
  image_json ->> 'bucket',
  image_json ->> 'storageKey',
  image_json ->> 'thumbnailStorageKey',
  image_json ->> 'fileName',
  case when exists (
    select 1
    from storage.objects
    where bucket_id = image_json ->> 'bucket'
      and name = image_json ->> 'thumbnailStorageKey'
  ) then 'ready' else 'queued' end,
  ticket_id,
  now()
from distinct_references
on conflict (bucket, original_storage_key) do nothing;
