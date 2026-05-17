do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'update_updated_at_column'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    create function public.update_updated_at_column()
    returns trigger
    language plpgsql
    as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$;
  end if;
end;
$$;

create table if not exists public.directors (
  id text primary key,
  code text not null unique,
  name text not null,
  type text,
  phone text,
  bank_account text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint directors_code_not_blank check (length(btrim(code)) > 0),
  constraint directors_name_not_blank check (length(btrim(name)) > 0)
);

create table if not exists public.machines (
  id text primary key,
  code text not null unique,
  name text not null,
  branch_id text references public.branches(id) on update cascade on delete restrict,
  type text,
  capacity_kg_per_hr numeric(14, 3),
  normal_yield_pct numeric(7, 3),
  std_process_cost_per_hr numeric(14, 2),
  maintenance_status text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint machines_code_not_blank check (length(btrim(code)) > 0),
  constraint machines_name_not_blank check (length(btrim(name)) > 0),
  constraint machines_capacity_non_negative check (capacity_kg_per_hr is null or capacity_kg_per_hr >= 0),
  constraint machines_yield_range check (normal_yield_pct is null or (normal_yield_pct >= 0 and normal_yield_pct <= 100)),
  constraint machines_process_cost_non_negative check (std_process_cost_per_hr is null or std_process_cost_per_hr >= 0)
);

create table if not exists public.production_lines (
  id text primary key,
  code text not null unique,
  name text not null,
  branch_id text references public.branches(id) on update cascade on delete restrict,
  responsible_person text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_lines_code_not_blank check (length(btrim(code)) > 0),
  constraint production_lines_name_not_blank check (length(btrim(name)) > 0)
);

create table if not exists public.payment_methods (
  id text primary key,
  code text not null unique,
  name text not null,
  type text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_methods_code_not_blank check (length(btrim(code)) > 0),
  constraint payment_methods_name_not_blank check (length(btrim(name)) > 0)
);

create table if not exists public.remittance_purposes (
  id text primary key,
  code text not null unique,
  name text not null,
  required_doc text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint remittance_purposes_code_not_blank check (length(btrim(code)) > 0),
  constraint remittance_purposes_name_not_blank check (length(btrim(name)) > 0)
);

create index if not exists machines_branch_id_idx on public.machines(branch_id);
create index if not exists machines_active_idx on public.machines(active);
create index if not exists production_lines_branch_id_idx on public.production_lines(branch_id);
create index if not exists production_lines_active_idx on public.production_lines(active);
create index if not exists directors_active_idx on public.directors(active);
create index if not exists payment_methods_active_idx on public.payment_methods(active);
create index if not exists remittance_purposes_active_idx on public.remittance_purposes(active);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_directors_updated_at' and tgrelid = 'public.directors'::regclass) then
    create trigger set_directors_updated_at
    before update on public.directors
    for each row execute function public.update_updated_at_column();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'set_machines_updated_at' and tgrelid = 'public.machines'::regclass) then
    create trigger set_machines_updated_at
    before update on public.machines
    for each row execute function public.update_updated_at_column();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'set_production_lines_updated_at' and tgrelid = 'public.production_lines'::regclass) then
    create trigger set_production_lines_updated_at
    before update on public.production_lines
    for each row execute function public.update_updated_at_column();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'set_payment_methods_updated_at' and tgrelid = 'public.payment_methods'::regclass) then
    create trigger set_payment_methods_updated_at
    before update on public.payment_methods
    for each row execute function public.update_updated_at_column();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'set_remittance_purposes_updated_at' and tgrelid = 'public.remittance_purposes'::regclass) then
    create trigger set_remittance_purposes_updated_at
    before update on public.remittance_purposes
    for each row execute function public.update_updated_at_column();
  end if;
end;
$$;

alter table public.directors enable row level security;
alter table public.machines enable row level security;
alter table public.production_lines enable row level security;
alter table public.payment_methods enable row level security;
alter table public.remittance_purposes enable row level security;

insert into public.directors (id, code, name, type, phone, bank_account, active)
values
  ('D001', 'D001', 'คุณ ก. (กรรมการ)', 'กรรมการ', '081-xxxxxxx', 'กสิกร 111-2-33333-4', true),
  ('D002', 'D002', 'คุณ ข. (กรรมการ)', 'กรรมการ', '089-xxxxxxx', 'ไทยพาณิชย์ 222-3-44444-5', true),
  ('D003', 'E001', 'คุณสมหญิง', 'พนักงาน', '081-xxxxxxx', 'กรุงไทย 333-4-55555-6', true)
on conflict (id) do nothing;

insert into public.machines (id, code, name, branch_id, type, capacity_kg_per_hr, normal_yield_pct, std_process_cost_per_hr, maintenance_status, active)
values
  ('MC001', 'PRESS-01', 'เครื่องอัดเศษเหล็ก #1', 'BR002', 'Baling', 2000, 95, 300, 'Normal', true),
  ('MC002', 'PRESS-02', 'เครื่องอัดเศษเหล็ก #2', 'BR003', 'Baling', 1800, 93, 280, 'Normal', true),
  ('MC003', 'SHEAR-01', 'เครื่องตัดเหล็ก', 'BR002', 'Cutting', 1500, 97, 250, 'Normal', true),
  ('MC004', 'SORT-01', 'สายแยกประเภท', 'BR002', 'Sorting', 3000, 98, 200, 'Normal', true)
on conflict (id) do nothing;

insert into public.production_lines (id, code, name, branch_id, responsible_person, active)
values
  ('PL001', 'LINE-A', 'Line A - คัดแยก/อัดก้อน', 'BR002', 'หัวหน้า A', true),
  ('PL002', 'LINE-B', 'Line B - ตัด/แปรรูป', 'BR002', 'หัวหน้า B', true),
  ('PL003', 'LINE-C', 'Line C - นครสวรรค์', 'BR003', 'หัวหน้า C', true)
on conflict (id) do nothing;

insert into public.payment_methods (id, code, name, type, active)
values
  ('PM-001', 'PM-001', 'Cash', 'Cash', true),
  ('PM-002', 'PM-002', 'Bank Transfer', 'Bank Transfer', true),
  ('PM-003', 'PM-003', 'Cheque', 'Cheque', true),
  ('PM-004', 'PM-004', 'PromptPay', 'PromptPay', true),
  ('PM-005', 'PM-005', 'International Transfer', 'International Transfer', true),
  ('PM-006', 'PM-006', 'FCD Transfer', 'FCD Transfer', true)
on conflict (id) do nothing;

insert into public.remittance_purposes (id, code, name, required_doc, active)
values
  ('RP-001', 'GOODS', 'ชำระค่าสินค้า', 'Invoice/PO', true),
  ('RP-002', 'FREIGHT', 'ค่าขนส่ง / Freight', 'BL/AWB', true),
  ('RP-003', 'SERVICE', 'ค่าบริการต่างประเทศ', 'Service Contract', true),
  ('RP-004', 'REFUND', 'คืนเงินมัดจำ', 'Refund Letter', true),
  ('RP-005', 'LOAN', 'เงินกู้ / Loan', 'Loan Agreement', true),
  ('RP-099', 'OTHER', 'อื่นๆ', '', true)
on conflict (id) do nothing;
