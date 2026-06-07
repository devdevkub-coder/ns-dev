begin;

update public.impurities
set code = upper(coalesce(nullif(btrim(code), ''), 'IMP-' || lpad(id::text, 3, '0')))
where code is null
  or btrim(code) = ''
  or code <> upper(btrim(code));

alter table public.impurities
  alter column code set not null;

alter table public.impurities
  drop constraint if exists impurities_code_not_blank;

alter table public.impurities
  add constraint impurities_code_not_blank
  check (length(btrim(code)) > 0);

commit;
