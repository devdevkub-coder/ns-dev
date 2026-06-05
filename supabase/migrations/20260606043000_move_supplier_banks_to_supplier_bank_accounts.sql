alter table public.supplier_bank_accounts
  add column if not exists bank_name_id bigint;

update public.supplier_bank_accounts sba
set bank_name_id = bn.id
from public.bank_names bn
where sba.bank_name is not null
  and sba.bank_name = bn.name
  and sba.bank_name_id is null;

do $$
begin
  if exists (
    select 1
    from public.supplier_bank_accounts sba
    where sba.bank_name is not null
      and sba.bank_name_id is null
  ) then
    raise exception 'supplier_bank_accounts has bank_name values that do not map to bank_names';
  end if;
end $$;

alter table public.supplier_bank_accounts
  add constraint fk_supplier_bank_accounts_bank_name
  foreign key (bank_name_id) references public.bank_names(id)
  on update no action
  on delete no action;

create index if not exists idx_supplier_bank_accounts_bank_name
  on public.supplier_bank_accounts(bank_name_id);

alter table public.supplier_bank_accounts
  drop column if exists bank_name;

alter table public.suppliers
  drop column if exists bank_name,
  drop column if exists bank_account,
  drop column if exists bank_account_name;
