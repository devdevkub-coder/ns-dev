-- Purchase Bill source capacity must be enforced by the database because the
-- availability shown in the form can become stale before another user saves.

begin;

create table if not exists public.document_number_counters (
  document_type text not null,
  period_key text not null,
  last_number integer not null check (last_number >= 0),
  updated_at timestamptz not null default now(),
  primary key (document_type, period_key)
);

create or replace function public.reserve_document_number(
  p_document_type text,
  p_period_key text,
  p_initial_number integer
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_next_number integer;
begin
  if coalesce(trim(p_document_type), '') = '' then
    raise exception 'DOCUMENT_NUMBER_TYPE_REQUIRED';
  end if;
  if coalesce(trim(p_period_key), '') = '' then
    raise exception 'DOCUMENT_NUMBER_PERIOD_REQUIRED';
  end if;
  if coalesce(p_initial_number, -1) < 0 then
    raise exception 'DOCUMENT_NUMBER_INITIAL_INVALID';
  end if;

  insert into public.document_number_counters (
    document_type,
    period_key,
    last_number,
    updated_at
  )
  values (
    p_document_type,
    p_period_key,
    p_initial_number + 1,
    now()
  )
  on conflict (document_type, period_key) do update
  set
    last_number = greatest(
      public.document_number_counters.last_number + 1,
      excluded.last_number
    ),
    updated_at = now()
  returning last_number into v_next_number;

  return v_next_number;
end;
$$;

create or replace function public.enforce_purchase_bill_receipt_allocation_capacity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_net_weight numeric;
  v_allocated_qty numeric;
  v_summary_ticket_id bigint;
begin
  if new.allocation_status <> 'active' then
    return new;
  end if;

  select summary.net_weight, summary.weight_ticket_id
    into v_net_weight, v_summary_ticket_id
  from public.weight_ticket_product_summaries summary
  where summary.id = new.weight_ticket_product_summary_id
  for update;

  if not found then
    raise exception 'PURCHASE_BILL_RECEIPT_SUMMARY_NOT_FOUND';
  end if;
  if v_summary_ticket_id <> new.weight_ticket_id then
    raise exception 'PURCHASE_BILL_RECEIPT_SUMMARY_TICKET_MISMATCH';
  end if;

  select coalesce(sum(allocation.allocated_qty), 0)
    into v_allocated_qty
  from public.purchase_bill_receipt_allocations allocation
  join public.purchase_bills bill on bill.id = allocation.purchase_bill_id
  where allocation.weight_ticket_product_summary_id = new.weight_ticket_product_summary_id
    and allocation.allocation_status = 'active'
    and lower(coalesce(bill.status, '')) not in ('cancelled', 'cancelled_supplier_swap')
    and (tg_op = 'INSERT' or allocation.id <> new.id);

  if v_allocated_qty + new.allocated_qty > v_net_weight + 0.0001 then
    raise exception 'PURCHASE_BILL_RECEIPT_ALLOCATION_EXCEEDS_AVAILABLE_WEIGHT';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_purchase_bill_receipt_allocation_capacity
  on public.purchase_bill_receipt_allocations;

create trigger trg_enforce_purchase_bill_receipt_allocation_capacity
before insert or update of allocation_status, allocated_qty, weight_ticket_id, weight_ticket_product_summary_id
on public.purchase_bill_receipt_allocations
for each row
execute function public.enforce_purchase_bill_receipt_allocation_capacity();

insert into supabase_migrations.schema_migrations (version, name)
select '20260730230000', 'harden_purchase_bill_write_guards'
where not exists (
  select 1
  from supabase_migrations.schema_migrations
  where version = '20260730230000'
);

commit;
