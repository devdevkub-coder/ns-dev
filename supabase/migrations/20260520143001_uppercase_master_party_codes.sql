begin;

do $$
begin
  if exists (
    select 1
    from public.salespersons
    where code is null or upper(code) !~ '^SA[0-9]{3}$'
  ) then
    raise exception 'salespersons.code must be canonical SA001-SA999 before uppercase ID migration';
  end if;

  if exists (
    select 1
    from public.suppliers
    where code is null or upper(code) !~ '^SU[0-9]{4,5}$'
  ) then
    raise exception 'suppliers.code must be canonical SU0001-SU99999 before uppercase ID migration';
  end if;

  if exists (
    select upper(code)
    from public.salespersons
    group by upper(code)
    having count(*) > 1
  ) then
    raise exception 'duplicate canonical salespersons.code values found';
  end if;

  if exists (
    select upper(code)
    from public.suppliers
    group by upper(code)
    having count(*) > 1
  ) then
    raise exception 'duplicate canonical suppliers.code values found';
  end if;
end $$;

create temp table _salesperson_id_map on commit drop as
select id as old_id, upper(code) as new_id
from public.salespersons;

create temp table _supplier_id_map on commit drop as
select id as old_id, upper(code) as new_id
from public.suppliers;

update public.customers target
set sales_id = map.new_id
from _salesperson_id_map map
where target.sales_id = map.old_id
  and target.sales_id is distinct from map.new_id;

update public.purchase_bills target
set sales_id = map.new_id
from _salesperson_id_map map
where target.sales_id = map.old_id
  and target.sales_id is distinct from map.new_id;

update public.sales_bills target
set sales_id = map.new_id
from _salesperson_id_map map
where target.sales_id = map.old_id
  and target.sales_id is distinct from map.new_id;

update public.suppliers target
set sales_id = map.new_id
from _salesperson_id_map map
where target.sales_id = map.old_id
  and target.sales_id is distinct from map.new_id;

update public.bill_swap_history target
set before_supplier_id = map.new_id
from _supplier_id_map map
where target.before_supplier_id = map.old_id
  and target.before_supplier_id is distinct from map.new_id;

update public.bill_swap_history target
set after_supplier_id = map.new_id
from _supplier_id_map map
where target.after_supplier_id = map.old_id
  and target.after_supplier_id is distinct from map.new_id;

alter table public.assets drop constraint if exists assets_supplier_id_fkey;
alter table public.assets
  add constraint assets_supplier_id_fkey
  foreign key (supplier_id) references public.suppliers(id)
  on update cascade on delete no action;

alter table public.payments drop constraint if exists payments_supplier_id_fkey;
alter table public.payments
  add constraint payments_supplier_id_fkey
  foreign key (supplier_id) references public.suppliers(id)
  on update cascade on delete no action;

alter table public.po_buys drop constraint if exists po_buys_supplier_id_fkey;
alter table public.po_buys
  add constraint po_buys_supplier_id_fkey
  foreign key (supplier_id) references public.suppliers(id)
  on update cascade on delete no action;

alter table public.purchase_bills drop constraint if exists purchase_bills_supplier_id_fkey;
alter table public.purchase_bills
  add constraint purchase_bills_supplier_id_fkey
  foreign key (supplier_id) references public.suppliers(id)
  on update cascade on delete no action;

alter table public.trading_deals drop constraint if exists trading_deals_supplier_id_fkey;
alter table public.trading_deals
  add constraint trading_deals_supplier_id_fkey
  foreign key (supplier_id) references public.suppliers(id)
  on update cascade on delete no action;

update public.salespersons
set code = upper(code);

update public.salespersons
set id = code
where id is distinct from code;

update public.suppliers
set code = upper(code);

update public.suppliers
set id = code
where id is distinct from code;

commit;
