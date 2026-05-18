do $$
begin
  if exists (
    select 1
    from public.purchase_bills
    group by doc_no
    having count(*) > 1
  ) then
    raise exception 'purchase_bills.doc_no has duplicates; resolve duplicates before adding unique constraint';
  end if;

  if exists (
    select 1
    from public.sales_bills
    group by doc_no
    having count(*) > 1
  ) then
    raise exception 'sales_bills.doc_no has duplicates; resolve duplicates before adding unique constraint';
  end if;
end $$;

create unique index if not exists uq_purchase_bills_doc_no on public.purchase_bills (doc_no);
create unique index if not exists uq_sales_bills_doc_no on public.sales_bills (doc_no);
