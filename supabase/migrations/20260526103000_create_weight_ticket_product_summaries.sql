create table if not exists public.weight_ticket_product_summaries (
  id text primary key,
  weight_ticket_id text not null references public.weight_tickets(id) on delete cascade,
  product_id text not null references public.products(id) on delete restrict,
  product_name text not null,
  line_count integer not null default 0,
  gross_weight numeric not null default 0,
  deduct_weight numeric not null default 0,
  net_weight numeric not null default 0,
  billed_weight numeric not null default 0,
  remaining_weight numeric not null default 0,
  has_mixed_deduction_profiles boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_weight_ticket_product_summaries_ticket
  on public.weight_ticket_product_summaries(weight_ticket_id);

create index if not exists idx_weight_ticket_product_summaries_product
  on public.weight_ticket_product_summaries(product_id);

create unique index if not exists uq_weight_ticket_product_summaries_ticket_product
  on public.weight_ticket_product_summaries(weight_ticket_id, product_id);

create table if not exists public.weight_ticket_product_summary_lines (
  id text primary key,
  summary_id text not null references public.weight_ticket_product_summaries(id) on delete cascade,
  weight_ticket_line_id text not null references public.weight_ticket_lines(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_weight_ticket_product_summary_lines_summary
  on public.weight_ticket_product_summary_lines(summary_id);

create unique index if not exists uq_weight_ticket_product_summary_lines_summary_line
  on public.weight_ticket_product_summary_lines(summary_id, weight_ticket_line_id);

create unique index if not exists uq_weight_ticket_product_summary_lines_line
  on public.weight_ticket_product_summary_lines(weight_ticket_line_id);

with summary_rows as (
  select
    'WTS-' || gen_random_uuid()::text as id,
    l.weight_ticket_id,
    l.product_id,
    max(l.product_name) as product_name,
    count(*)::integer as line_count,
    coalesce(sum(l.gross_weight), 0) as gross_weight,
    coalesce(sum(l.deduct_weight), 0) as deduct_weight,
    coalesce(sum(l.net_weight), 0) as net_weight,
    (
      count(
        distinct concat_ws(
          '|',
          coalesce(l.deduction_mode, ''),
          coalesce(l.impurity_id, ''),
          coalesce(l.deduction_value::text, '')
        )
      ) > 1
    ) as has_mixed_deduction_profiles,
    now() as created_at,
    now() as updated_at
  from public.weight_ticket_lines l
  left join public.weight_ticket_product_summaries existing
    on existing.weight_ticket_id = l.weight_ticket_id
   and existing.product_id = l.product_id
  where existing.id is null
  group by l.weight_ticket_id, l.product_id
)
insert into public.weight_ticket_product_summaries (
  id,
  weight_ticket_id,
  product_id,
  product_name,
  line_count,
  gross_weight,
  deduct_weight,
  net_weight,
  billed_weight,
  remaining_weight,
  has_mixed_deduction_profiles,
  created_at,
  updated_at
)
select
  id,
  weight_ticket_id,
  product_id,
  product_name,
  line_count,
  gross_weight,
  deduct_weight,
  net_weight,
  0,
  net_weight,
  has_mixed_deduction_profiles,
  created_at,
  updated_at
from summary_rows;

insert into public.weight_ticket_product_summary_lines (
  id,
  summary_id,
  weight_ticket_line_id,
  created_at
)
select
  'WTSL-' || gen_random_uuid()::text as id,
  s.id as summary_id,
  l.id as weight_ticket_line_id,
  now()
from public.weight_ticket_lines l
join public.weight_ticket_product_summaries s
  on s.weight_ticket_id = l.weight_ticket_id
 and s.product_id = l.product_id
left join public.weight_ticket_product_summary_lines existing
  on existing.weight_ticket_line_id = l.id
where existing.id is null;

with billed_by_summary as (
  select
    s.id as summary_id,
    coalesce(sum(pbi.qty), 0) as billed_weight
  from public.weight_ticket_product_summaries s
  left join public.weight_ticket_product_summary_lines sl
    on sl.summary_id = s.id
  left join public.weight_ticket_lines l
    on l.id = sl.weight_ticket_line_id
  left join public.purchase_bill_items pbi
    on coalesce(pbi.source_snapshot ->> 'receiptTicketId', '') = s.weight_ticket_id
   and coalesce(pbi.source_snapshot ->> 'receiptLineId', '') = l.id
  left join public.purchase_bills pb
    on pb.id = pbi.purchase_bill_id
  where pb.id is null or coalesce(pb.status, '') <> 'cancelled'
  group by s.id
)
update public.weight_ticket_product_summaries s
set
  billed_weight = greatest(0, b.billed_weight),
  remaining_weight = greatest(0, s.net_weight - b.billed_weight),
  updated_at = now()
from billed_by_summary b
where b.summary_id = s.id;
