do $$
declare
  table_name text;
  image_column text;
  row_record record;
  image_record record;
  image_values text[];
  image_json jsonb;
  image_bucket text;
  image_file_name text;
  image_storage_key text;
  image_thumbnail_key text;
  candidate_buckets text[];
begin
  for table_name, image_column in
    select * from (values
      ('weight_tickets', 'vehicle_image_names'),
      ('weight_ticket_lines', 'image_names')
    ) image_sources(table_name, image_column)
  loop
    for row_record in execute format(
      'select id, %I as image_values from public.%I where %I is not null',
      image_column,
      table_name,
      image_column
    )
    loop
      image_values := array[]::text[];

      for image_record in
        select value
        from unnest(row_record.image_values) with ordinality as image_values(value, position)
        order by position
      loop
        if image_record.value is null or nullif(trim(image_record.value), '') is null then
          raise exception 'WTI/WTO image repair blocked: empty image reference in %.% id=%', table_name, image_column, row_record.id;
        end if;

        begin
          image_json := image_record.value::jsonb;
        exception when others then
          raise exception 'WTI/WTO image repair blocked: invalid JSON image reference in %.% id=%', table_name, image_column, row_record.id;
        end;

        if jsonb_typeof(image_json) <> 'object' then
          raise exception 'WTI/WTO image repair blocked: image reference is not an object in %.% id=%', table_name, image_column, row_record.id;
        end if;

        image_bucket := nullif(trim(image_json ->> 'bucket'), '');
        image_file_name := nullif(trim(image_json ->> 'fileName'), '');
        image_storage_key := nullif(trim(image_json ->> 'storageKey'), '');
        image_thumbnail_key := nullif(trim(image_json ->> 'thumbnailStorageKey'), '');

        if image_file_name is null or image_storage_key is null then
          raise exception 'WTI/WTO image repair blocked: missing fileName/storageKey in %.% id=%', table_name, image_column, row_record.id;
        end if;

        if image_thumbnail_key is not null and image_bucket is not null then
          if not exists (
            select 1
            from storage.objects
            where bucket_id = image_bucket
              and name = image_storage_key
          ) then
            raise exception 'WTI/WTO image repair blocked: original object missing in bucket % for %.% id=%', image_bucket, table_name, image_column, row_record.id;
          end if;

          image_values := array_append(image_values, image_record.value);
          continue;
        end if;

        if image_bucket is null then
          select array_agg(distinct bucket_id order by bucket_id)
          into candidate_buckets
          from storage.objects
          where name = image_storage_key;

          if coalesce(array_length(candidate_buckets, 1), 0) <> 1 then
            raise exception 'WTI/WTO image repair blocked: storageKey % resolves to % buckets in %.% id=%', image_storage_key, coalesce(array_length(candidate_buckets, 1), 0), table_name, image_column, row_record.id;
          end if;

          image_bucket := candidate_buckets[1];
        end if;

        if not exists (
          select 1
          from storage.objects
          where bucket_id = image_bucket
            and name = image_storage_key
        ) then
          raise exception 'WTI/WTO image repair blocked: original object missing in bucket % for %.% id=%', image_bucket, table_name, image_column, row_record.id;
        end if;

        image_thumbnail_key := case
          when image_storage_key ~ '\\.[^./]+$'
            then regexp_replace(image_storage_key, '\\.[^./]+$', '.thumb.webp')
          else image_storage_key || '.thumb.webp'
        end;

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
        table_name,
        image_column
      ) using image_values, row_record.id;
    end loop;
  end loop;
end $$;
