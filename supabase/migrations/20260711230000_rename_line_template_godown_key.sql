update public.line_message_templates
set config = jsonb_set(
  config,
  '{fields}',
  (
    select jsonb_agg(
      case
        when field ->> 'key' = 'warehouseName'
          then jsonb_set(field, '{key}', '"godownName"'::jsonb)
        else field
      end
      order by ordinal
    )
    from jsonb_array_elements(config -> 'fields') with ordinality as fields(field, ordinal)
  ),
  false
),
updated_at = now()
where template_type = 'weight_ticket'
  and jsonb_typeof(config -> 'fields') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(config -> 'fields') as fields(field)
    where field ->> 'key' = 'warehouseName'
  );
