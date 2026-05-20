-- Configurable VAT/WHT rates used by transaction forms.
-- Additive: keeps existing purchase bill totals intact and stores the VAT rate used on new/edited bills.

create table if not exists public.vat_settings (
  id text primary key,
  name text not null,
  rate_percent numeric(5,2) not null default 7.00,
  active boolean not null default true,
  is_default boolean not null default false,
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint vat_settings_rate_percent_chk check (rate_percent >= 0 and rate_percent <= 100),
  constraint vat_settings_effective_range_chk check (effective_to is null or effective_to >= effective_from)
);

comment on table public.vat_settings is 'Master/config table for VAT percentages used by transaction forms.';
comment on column public.vat_settings.rate_percent is 'VAT percentage, for example 7.00 for Thai VAT 7%.';

drop trigger if exists vat_settings_set_updated_at on public.vat_settings;
create trigger vat_settings_set_updated_at
before update on public.vat_settings
for each row execute function public.app_set_updated_at();

create unique index if not exists uq_vat_settings_default_active
on public.vat_settings (is_default)
where active and is_default;

create index if not exists idx_vat_settings_effective
on public.vat_settings (active, is_default, effective_from desc);

insert into public.vat_settings (
  id,
  name,
  rate_percent,
  active,
  is_default,
  effective_from
) values (
  'VAT-001',
  'VAT 7%',
  7.00,
  true,
  true,
  date '2026-01-01'
)
on conflict (id) do nothing;

create table if not exists public.wht_settings (
  id text primary key,
  name text not null,
  rate_percent numeric(5,2) not null default 3.00,
  active boolean not null default true,
  is_default boolean not null default false,
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint wht_settings_rate_percent_chk check (rate_percent >= 0 and rate_percent <= 100),
  constraint wht_settings_effective_range_chk check (effective_to is null or effective_to >= effective_from)
);

comment on table public.wht_settings is 'Master/config table for WHT percentages used by payment and tax flows.';
comment on column public.wht_settings.rate_percent is 'Withholding tax percentage, for example 3.00 for common service WHT 3%.';

drop trigger if exists wht_settings_set_updated_at on public.wht_settings;
create trigger wht_settings_set_updated_at
before update on public.wht_settings
for each row execute function public.app_set_updated_at();

create unique index if not exists uq_wht_settings_default_active
on public.wht_settings (is_default)
where active and is_default;

create index if not exists idx_wht_settings_effective
on public.wht_settings (active, is_default, effective_from desc);

insert into public.wht_settings (
  id,
  name,
  rate_percent,
  active,
  is_default,
  effective_from
) values (
  'WHT-001',
  'WHT 3%',
  3.00,
  true,
  true,
  date '2026-01-01'
)
on conflict (id) do nothing;

alter table public.purchase_bills
add column if not exists vat_rate_percent numeric(5,2) not null default 7.00;

alter table public.purchase_bills
drop constraint if exists purchase_bills_vat_rate_percent_chk;

alter table public.purchase_bills
add constraint purchase_bills_vat_rate_percent_chk check (vat_rate_percent >= 0 and vat_rate_percent <= 100);
