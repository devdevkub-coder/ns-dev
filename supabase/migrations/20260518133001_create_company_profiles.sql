-- Company profile used by printable purchase/sales documents.
-- Additive/non-destructive: creates a singleton target table and seeds the legacy default.

create table if not exists public.company_profiles (
  id text primary key,
  name text not null,
  name_en text,
  tax_id text,
  branch_code text default '00000',
  address text not null,
  phone text not null,
  fax text,
  email text,
  website text,
  bank_info text,
  footer_note text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint company_profiles_tax_id_chk check (tax_id is null or tax_id ~ '^[0-9]{13}$'),
  constraint company_profiles_branch_code_chk check (branch_code is null or branch_code ~ '^[0-9]{5}$'),
  constraint company_profiles_email_ascii_chk check (email is null or email ~ '^[ -~]+$'),
  constraint company_profiles_logo_size_chk check (logo_url is null or length(logo_url) <= 250000)
);

comment on table public.company_profiles is 'Singleton company information used on printable documents.';
comment on column public.company_profiles.id is 'Use default for the current company profile singleton.';
comment on column public.company_profiles.logo_url is 'Small data URL or URL for print logo. Keep under roughly 200KB before base64 overhead.';

drop trigger if exists company_profiles_set_updated_at on public.company_profiles;
create trigger company_profiles_set_updated_at
before update on public.company_profiles
for each row execute function public.app_set_updated_at();

insert into public.company_profiles (
  id,
  name,
  name_en,
  tax_id,
  branch_code,
  address,
  phone,
  footer_note
) values (
  'default',
  'บริษัท นิวโซลูชั่นส์ (ไทยแลนด์) จำกัด',
  'New Solutions (Thailand) Co., Ltd.',
  null,
  '00000',
  'กรุณาแก้ไขที่ Setup → ข้อมูลบริษัท',
  '-',
  'ขอขอบคุณที่ใช้บริการ'
)
on conflict (id) do nothing;

insert into public.app_permissions (code, module, resource, action, description) values
  ('system.settings.manage', 'system', 'settings', 'manage', 'จัดการตั้งค่าระบบและข้อมูลบริษัท')
on conflict (code) do nothing;

insert into public.app_role_permissions (role_id, permission_id)
select r.id, p.id
from public.app_roles r
join public.app_permissions p on p.code = 'system.settings.manage'
where r.code in ('admin', 'owner')
on conflict do nothing;
