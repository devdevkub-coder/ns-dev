insert into public.system_settings (key, description, value)
values (
  'SALES_PLAN_LME_CONFIG',
  'Sales Plan LME reference pricing config (manual + live fetched values)',
  '{"fxRate":36,"kgPerContainer":25000,"lmeAluminumUSD":2400,"lmeBrassUSD":7000,"lmeCopperUSD":9000,"liveFetchNote":"Live fetch: USD/THB จาก exchangerate-api และ Metals จาก metals.dev (demo key) — ถ้า fetch fail ให้กรอกเอง","source":"default"}'
)
on conflict (key) do nothing;
