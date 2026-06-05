alter table public.bank_statement
add column if not exists doc_no text;

with numbered as (
  select
    id,
    date,
    'BST'
      || to_char(date, 'YYMM')
      || '-'
      || lpad(
        row_number() over (
          partition by to_char(date, 'YYMM')
          order by date asc, id asc
        )::text,
        4,
        '0'
      ) as generated_doc_no
  from public.bank_statement
)
update public.bank_statement as bank_statement
set doc_no = numbered.generated_doc_no
from numbered
where bank_statement.id = numbered.id
  and (bank_statement.doc_no is null or btrim(bank_statement.doc_no) = '');

alter table public.bank_statement
alter column doc_no set not null;

create unique index if not exists uq_bank_statement_doc_no
on public.bank_statement (doc_no);
