alter table public.warehouses
  add column if not exists in_charge text,
  add column if not exists phone text,
  add column if not exists supported_processes text[] not null default '{}',
  add column if not exists target_sort_kg numeric,
  add column if not exists target_bale_count integer,
  add column if not exists max_capacity_kg numeric,
  add column if not exists updated_at timestamptz;

comment on column public.warehouses.in_charge is 'ผู้รับผิดชอบ/หัวหน้าโกดัง';
comment on column public.warehouses.phone is 'เบอร์โทรศัพท์ประจำโกดัง';
comment on column public.warehouses.supported_processes is 'ประเภทงานที่โกดังรองรับ (RECEIVE, SORT, BALE, LOAD, CRUSH)';
comment on column public.warehouses.target_sort_kg is 'เป้าน้ำหนักคัดแยก (กก./วัน)';
comment on column public.warehouses.target_bale_count is 'เป้าจำนวนก้อนอัด (ก้อน/วัน)';
comment on column public.warehouses.max_capacity_kg is 'ความจุสูงสุดของลาน/โกดัง (กก.)';
