alter table public.purchase_bills
  add column if not exists supplier_name_snapshot text,
  add column if not exists supplier_tax_id_snapshot text,
  add column if not exists supplier_address_snapshot text,
  add column if not exists supplier_phone_snapshot text,
  add column if not exists supplier_sales_rep_snapshot text;

update public.purchase_bills pb
set
  supplier_name_snapshot = s.name,
  supplier_tax_id_snapshot = s.tax_id,
  supplier_address_snapshot = s.address,
  supplier_phone_snapshot = s.phone,
  supplier_sales_rep_snapshot = s.sales_rep
from public.suppliers s
where pb.supplier_id = s.id
  and (
    pb.supplier_name_snapshot is null
    or pb.supplier_tax_id_snapshot is null
    or pb.supplier_address_snapshot is null
    or pb.supplier_phone_snapshot is null
    or pb.supplier_sales_rep_snapshot is null
  );
