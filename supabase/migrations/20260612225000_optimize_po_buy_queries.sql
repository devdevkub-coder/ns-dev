create index if not exists idx_po_buys_date_doc_no
  on public.po_buys(date desc, doc_no desc);

create index if not exists idx_po_buys_branch_date_doc_no
  on public.po_buys(branch_id, date desc, doc_no desc)
  where branch_id is not null;

create index if not exists idx_po_buys_status_date_doc_no
  on public.po_buys(status, date desc, doc_no desc)
  where status is not null;

create index if not exists idx_po_buys_doc_no_pattern
  on public.po_buys(doc_no text_pattern_ops);

create index if not exists idx_products_active_code_name
  on public.products(active desc, code asc, name asc)
  include (id, unit);

create index if not exists idx_suppliers_active_name_cover
  on public.suppliers(active desc, name asc)
  include (code, id);
