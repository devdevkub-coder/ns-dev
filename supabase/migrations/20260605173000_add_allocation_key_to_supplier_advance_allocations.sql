alter table public.supplier_advance_allocations
  add column if not exists allocation_key text;

update public.supplier_advance_allocations
set allocation_key = 'SAA-' || gen_random_uuid()::text
where allocation_key is null;

alter table public.supplier_advance_allocations
  alter column allocation_key set default ('SAA-'::text || gen_random_uuid()::text),
  alter column allocation_key set not null;

create unique index if not exists supplier_advance_allocations_allocation_key_key
  on public.supplier_advance_allocations (allocation_key);
