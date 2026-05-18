-- Normalize branch/warehouse labels for operational dropdowns.
-- Non-destructive: backs up affected rows before renaming/remapping.

create schema if not exists maintenance;

create table if not exists maintenance.branch_warehouse_normalize_backup_20260518 (
  source_table text not null,
  source_id text not null,
  before_data jsonb not null,
  backed_up_at timestamptz not null default now(),
  primary key (source_table, source_id)
);

insert into maintenance.branch_warehouse_normalize_backup_20260518 (source_table, source_id, before_data)
select 'branches', id, to_jsonb(b)
from public.branches b
where id in ('BR002', 'BR003')
on conflict do nothing;

insert into maintenance.branch_warehouse_normalize_backup_20260518 (source_table, source_id, before_data)
select 'warehouses', id, to_jsonb(w)
from public.warehouses w
where id in ('WH001', 'WH002', 'WH003', 'WH004', 'WH005', 'WH006')
on conflict do nothing;

insert into maintenance.branch_warehouse_normalize_backup_20260518 (source_table, source_id, before_data)
select 'purchase_bills', id, to_jsonb(p)
from public.purchase_bills p
where warehouse_id = 'WH001'
   or branch_id = 'BR001'
on conflict do nothing;

insert into maintenance.branch_warehouse_normalize_backup_20260518 (source_table, source_id, before_data)
select 'stock_ledger', id, to_jsonb(s)
from public.stock_ledger s
where warehouse_id = 'WH001'
   or branch_id = 'BR001'
on conflict do nothing;

update public.branches
set name = 'สมุทรสาคร',
    address = coalesce(nullif(address, ''), 'สมุทรสาคร'),
    updated_at = now()
where id = 'BR002';

update public.branches
set name = 'นครสวรรค์',
    address = coalesce(nullif(address, ''), 'นครสวรรค์'),
    updated_at = now()
where id = 'BR003';

update public.warehouses
set name = 'คลังสมุทรสาคร',
    branch_id = 'BR002'
where id = 'WH002';

update public.warehouses
set name = 'คลังนครสวรรค์',
    branch_id = 'BR003'
where id = 'WH003';

update public.warehouses
set name = 'WIP สมุทรสาคร',
    branch_id = 'BR002'
where id = 'WH004';

update public.warehouses
set name = 'WIP นครสวรรค์',
    branch_id = 'BR003'
where id = 'WH005';

update public.warehouses
set name = 'FG สมุทรสาคร',
    branch_id = 'BR002'
where id = 'WH006';

-- HQ branch was already removed from branch master; remap remaining HQ warehouse references
-- to the active Samut Sakhon warehouse so operational screens no longer show orphan HQ data.
update public.purchase_bills
set branch_id = coalesce(branch_id, 'BR002'),
    warehouse_id = 'WH002',
    updated_at = now()
where warehouse_id = 'WH001';

update public.stock_ledger
set branch_id = coalesce(branch_id, 'BR002'),
    warehouse_id = 'WH002',
    updated_at = now()
where warehouse_id = 'WH001';

update public.warehouses
set active = false,
    branch_id = null
where id = 'WH001';
