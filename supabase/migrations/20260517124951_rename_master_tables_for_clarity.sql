do $$
begin
  if to_regclass('public.director_employees') is null and to_regclass('public.directors') is not null then
    alter table public.directors rename to director_employees;
  end if;

  if to_regclass('public.production_machines') is null and to_regclass('public.machines') is not null then
    alter table public.machines rename to production_machines;
  end if;

  if to_regclass('public.overseas_remittance_purposes') is null and to_regclass('public.remittance_purposes') is not null then
    alter table public.remittance_purposes rename to overseas_remittance_purposes;
  end if;
end;
$$;

alter index if exists public.directors_active_idx rename to director_employees_active_idx;
alter index if exists public.machines_branch_id_idx rename to production_machines_branch_id_idx;
alter index if exists public.machines_active_idx rename to production_machines_active_idx;
alter index if exists public.remittance_purposes_active_idx rename to overseas_remittance_purposes_active_idx;

do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'set_directors_updated_at' and tgrelid = 'public.director_employees'::regclass) then
    alter trigger set_directors_updated_at on public.director_employees rename to set_director_employees_updated_at;
  end if;

  if exists (select 1 from pg_trigger where tgname = 'set_machines_updated_at' and tgrelid = 'public.production_machines'::regclass) then
    alter trigger set_machines_updated_at on public.production_machines rename to set_production_machines_updated_at;
  end if;

  if exists (select 1 from pg_trigger where tgname = 'set_remittance_purposes_updated_at' and tgrelid = 'public.overseas_remittance_purposes'::regclass) then
    alter trigger set_remittance_purposes_updated_at on public.overseas_remittance_purposes rename to set_overseas_remittance_purposes_updated_at;
  end if;
end;
$$;
