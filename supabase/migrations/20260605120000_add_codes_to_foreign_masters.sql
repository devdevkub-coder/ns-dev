alter table public.overseas_recipients
  add column if not exists code text;

with ranked_beneficiaries as (
  select
    id,
    'BEN-' || lpad(row_number() over (order by id)::text, 3, '0') as generated_code
  from public.overseas_recipients
)
update public.overseas_recipients recipients
set code = ranked_beneficiaries.generated_code
from ranked_beneficiaries
where recipients.id = ranked_beneficiaries.id
  and recipients.code is null;

alter table public.overseas_recipients
  alter column code set not null;

create unique index if not exists overseas_recipients_code_key
  on public.overseas_recipients (code);

with ranked_purposes as (
  select
    id,
    'RP-' || lpad(row_number() over (order by id)::text, 3, '0') as generated_code
  from public.overseas_remittance_purposes
)
update public.overseas_remittance_purposes purposes
set code = ranked_purposes.generated_code
from ranked_purposes
where purposes.id = ranked_purposes.id
  and purposes.code is null;

alter table public.overseas_remittance_purposes
  alter column code set not null;
