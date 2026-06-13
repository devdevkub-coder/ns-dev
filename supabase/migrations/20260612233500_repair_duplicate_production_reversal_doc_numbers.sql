begin;

with duplicate_groups as (
  select reversal_doc_no
  from public.production_inputs
  where reversal_doc_no is not null
  group by reversal_doc_no
  having count(distinct doc_no) > 1
),
source_groups as (
  select
    pi.reversal_doc_no as old_reversal_doc_no,
    pi.doc_no as source_doc_no,
    regexp_replace(pi.reversal_doc_no, '[0-9]+$', '') as doc_prefix,
    row_number() over (partition by pi.reversal_doc_no order by min(pi.id)) as duplicate_rank
  from public.production_inputs pi
  join duplicate_groups dg on dg.reversal_doc_no = pi.reversal_doc_no
  group by pi.reversal_doc_no, pi.doc_no
),
renumber_source_groups as (
  select *
  from source_groups
  where duplicate_rank > 1
),
prefix_max as (
  select
    r.doc_prefix,
    coalesce(max((regexp_match(pi.reversal_doc_no, '([0-9]+)$'))[1]::integer), 0) as max_running
  from renumber_source_groups r
  left join public.production_inputs pi
    on pi.reversal_doc_no like r.doc_prefix || '%'
  group by r.doc_prefix
),
renumber_mapping as (
  select
    r.old_reversal_doc_no,
    r.source_doc_no,
    r.doc_prefix || lpad((p.max_running + row_number() over (partition by r.doc_prefix order by r.old_reversal_doc_no, r.source_doc_no))::text, 4, '0') as new_reversal_doc_no
  from renumber_source_groups r
  join prefix_max p on p.doc_prefix = r.doc_prefix
),
affected_inputs as (
  select pi.id, pi.doc_no, m.old_reversal_doc_no, m.new_reversal_doc_no
  from public.production_inputs pi
  join renumber_mapping m
    on m.source_doc_no = pi.doc_no
   and m.old_reversal_doc_no = pi.reversal_doc_no
),
updated_input_ledger as (
  update public.stock_ledger sl
  set ref_no = ai.new_reversal_doc_no
  from affected_inputs ai
  where sl.ref_type = 'PI-REV'
    and sl.ref_no = ai.old_reversal_doc_no
    and sl.ref_id = ai.id::text
  returning sl.id
),
updated_input_logs as (
  update public.production_order_status_logs log
  set meta = jsonb_set(log.meta::jsonb, '{reversalDocNo}', to_jsonb(ai.new_reversal_doc_no))
  from affected_inputs ai
  where log.action = 'input_reversed'
    and log.meta is not null
    and log.meta::jsonb ->> 'inputDocNo' = ai.doc_no
    and log.meta::jsonb ->> 'reversalDocNo' = ai.old_reversal_doc_no
  returning log.id
)
update public.production_inputs pi
set reversal_doc_no = ai.new_reversal_doc_no
from affected_inputs ai
where pi.id = ai.id;

with duplicate_groups as (
  select reversal_doc_no
  from public.production_outputs
  where reversal_doc_no is not null
  group by reversal_doc_no
  having count(distinct doc_no) > 1
),
source_groups as (
  select
    po2.reversal_doc_no as old_reversal_doc_no,
    po2.doc_no as source_doc_no,
    regexp_replace(po2.reversal_doc_no, '[0-9]+$', '') as doc_prefix,
    row_number() over (partition by po2.reversal_doc_no order by min(po2.id)) as duplicate_rank
  from public.production_outputs po2
  join duplicate_groups dg on dg.reversal_doc_no = po2.reversal_doc_no
  group by po2.reversal_doc_no, po2.doc_no
),
renumber_source_groups as (
  select *
  from source_groups
  where duplicate_rank > 1
),
prefix_max as (
  select
    r.doc_prefix,
    coalesce(max((regexp_match(po2.reversal_doc_no, '([0-9]+)$'))[1]::integer), 0) as max_running
  from renumber_source_groups r
  left join public.production_outputs po2
    on po2.reversal_doc_no like r.doc_prefix || '%'
  group by r.doc_prefix
),
renumber_mapping as (
  select
    r.old_reversal_doc_no,
    r.source_doc_no,
    r.doc_prefix || lpad((p.max_running + row_number() over (partition by r.doc_prefix order by r.old_reversal_doc_no, r.source_doc_no))::text, 4, '0') as new_reversal_doc_no
  from renumber_source_groups r
  join prefix_max p on p.doc_prefix = r.doc_prefix
),
affected_outputs as (
  select po2.id, po2.doc_no, m.old_reversal_doc_no, m.new_reversal_doc_no
  from public.production_outputs po2
  join renumber_mapping m
    on m.source_doc_no = po2.doc_no
   and m.old_reversal_doc_no = po2.reversal_doc_no
),
updated_output_ledger as (
  update public.stock_ledger sl
  set ref_no = ao.new_reversal_doc_no
  from affected_outputs ao
  where sl.ref_type = 'PO2-REV'
    and sl.ref_no = ao.old_reversal_doc_no
    and sl.ref_id = ao.id::text
  returning sl.id
),
updated_output_logs as (
  update public.production_order_status_logs log
  set meta = jsonb_set(log.meta::jsonb, '{reversalDocNo}', to_jsonb(ao.new_reversal_doc_no))
  from affected_outputs ao
  where log.action = 'output_reversed'
    and log.meta is not null
    and log.meta::jsonb ->> 'outputDocNo' = ao.doc_no
    and log.meta::jsonb ->> 'reversalDocNo' = ao.old_reversal_doc_no
  returning log.id
)
update public.production_outputs po2
set reversal_doc_no = ao.new_reversal_doc_no
from affected_outputs ao
where po2.id = ao.id;

commit;
