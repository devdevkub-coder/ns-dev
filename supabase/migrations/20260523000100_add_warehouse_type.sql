alter table public.warehouses
  add column if not exists type text;

alter table public.warehouses
  drop constraint if exists warehouses_type_check;

alter table public.warehouses
  add constraint warehouses_type_check
  check (type is null or type in ('RM', 'WIP', 'FG', 'SCRAP'));

comment on column public.warehouses.type is 'Stock location type used for branch warehouse routing: RM, WIP, FG, or SCRAP.';
