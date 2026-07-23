-- Do not silently collapse duplicate business document numbers.
-- The migration must stop so the source data can be reconciled before enforcing the key.
do $$
begin
  if exists (
    select 1
    from public.production_orders
    group by doc_no
    having count(*) > 1
  ) then
    raise exception 'Cannot add unique production_orders.doc_no: duplicate values exist';
  end if;
end $$;

create unique index if not exists uq_production_orders_doc_no
  on public.production_orders (doc_no);
