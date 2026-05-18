create schema if not exists maintenance;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'suppliers'
      and column_name = 'email'
  ) then
    create table if not exists maintenance.supplier_email_backup_20260518 as
    select
      id,
      code,
      name,
      email,
      now() as backed_up_at
    from public.suppliers
    where email is not null
      and btrim(email) <> '';
  end if;
end $$;

alter table public.suppliers
  drop column if exists email;
