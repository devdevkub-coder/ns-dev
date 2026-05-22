alter table public.purchase_bills
  drop column if exists contact_phone,
  drop column if exists channel_id,
  drop column if exists date;

update public.purchase_bills
set created_at = now()
where created_at is null;

alter table public.purchase_bills
  alter column created_at set default now(),
  alter column created_at set not null;

create index if not exists idx_pb_created_at
  on public.purchase_bills (created_at desc);
