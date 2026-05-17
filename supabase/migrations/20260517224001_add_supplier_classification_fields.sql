-- Supplier classification and structured form fields for Next master-data UX.
-- Additive/non-destructive: existing supplier.name, supplier.contact, and supplier.address are preserved.

update public.suppliers
set type = null
where type is not null
  and btrim(type) = '';

update public.suppliers
set type = case
  when type in ('บริษัท', 'นิติบุคคล', '法人') then 'นิติบุคคล'
  when type in ('บุคคล', 'บุคคลธรรมดา', 'ส่วนบุคคล', 'ร้านค้า') then 'บุคคล'
  when type = 'ต่างประเทศ' then null
  else null
end;

update public.suppliers
set type = case
  when name ~* '(บริษัท|บจก\.?|บจ\.?|จำกัด|หจก\.?|ห้างหุ้นส่วน|corporation|co\.?[, ]*ltd|company|limited|ltd\.?|dmcc)' then 'นิติบุคคล'
  else 'บุคคล'
end
where type is null
   or btrim(type) = '';

alter table public.suppliers
  add column if not exists market_scope text not null default 'ในประเทศ',
  add column if not exists name_title text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists contact_title text,
  add column if not exists contact_first_name text,
  add column if not exists contact_last_name text,
  add column if not exists address_no text,
  add column if not exists address_moo text,
  add column if not exists address_village text,
  add column if not exists address_road text,
  add column if not exists address_subdistrict text,
  add column if not exists address_district text,
  add column if not exists address_province text,
  add column if not exists address_postal_code text,
  add column if not exists address_country text default 'ไทย';

comment on column public.suppliers.type is 'Supplier legal type: บุคคล or นิติบุคคล.';
comment on column public.suppliers.market_scope is 'Supplier market scope: ในประเทศ or ต่างประเทศ.';
comment on column public.suppliers.name_title is 'Title/prefix for individual supplier name.';
comment on column public.suppliers.first_name is 'First name for individual supplier.';
comment on column public.suppliers.last_name is 'Last name for individual supplier.';
comment on column public.suppliers.contact_title is 'Title/prefix for supplier contact person.';
comment on column public.suppliers.contact_first_name is 'First name for supplier contact person.';
comment on column public.suppliers.contact_last_name is 'Last name for supplier contact person.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'suppliers_type_allowed_chk'
      and conrelid = 'public.suppliers'::regclass
  ) then
    alter table public.suppliers
      add constraint suppliers_type_allowed_chk
      check (type is null or type in ('บุคคล', 'นิติบุคคล'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'suppliers_market_scope_allowed_chk'
      and conrelid = 'public.suppliers'::regclass
  ) then
    alter table public.suppliers
      add constraint suppliers_market_scope_allowed_chk
      check (market_scope in ('ในประเทศ', 'ต่างประเทศ'));
  end if;
end $$;

create index if not exists idx_suppliers_type on public.suppliers(type);
create index if not exists idx_suppliers_market_scope on public.suppliers(market_scope);
create index if not exists idx_suppliers_active on public.suppliers(active);
