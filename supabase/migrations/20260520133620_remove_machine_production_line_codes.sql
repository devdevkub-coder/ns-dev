create schema if not exists maintenance;

create table if not exists maintenance.production_machines_code_removal_backup_20260520133620 as
select *
from public.production_machines;

create table if not exists maintenance.production_lines_code_removal_backup_20260520133620 as
select *
from public.production_lines;

create table if not exists maintenance.accounts_code_removal_backup_20260520133620 as
select *
from public.accounts;

alter table public.production_machines
  drop constraint if exists machines_code_key,
  drop constraint if exists machines_code_not_blank;

alter table public.production_lines
  drop constraint if exists production_lines_code_key,
  drop constraint if exists production_lines_code_not_blank;

drop index if exists public.machines_code_key;
drop index if exists public.production_lines_code_key;

alter table public.production_machines
  drop column if exists code;

alter table public.production_lines
  drop column if exists code;

alter table public.accounts
  drop column if exists code;
