with candidates as (
  select
    par.id,
    par.doc_no as old_doc_no,
    par.date,
    to_char(par.date, 'YYMM') as ym,
    row_number() over (
      partition by to_char(par.date, 'YYMM')
      order by par.date asc, par.id asc
    ) as rn
  from public.petty_advance_returns par
  where par.doc_no is null
     or btrim(par.doc_no) = ''
     or par.doc_no !~ '^PRET[0-9]{4}-[0-9]+$'
),
existing_max as (
  select
    to_char(par.date, 'YYMM') as ym,
    max(coalesce(nullif(substring(par.doc_no from '^PRET[0-9]{4}-([0-9]+)$'), ''), '0')::int) as max_seq
  from public.petty_advance_returns par
  where par.doc_no ~ '^PRET[0-9]{4}-[0-9]+$'
    and not exists (select 1 from candidates c where c.id = par.id)
  group by to_char(par.date, 'YYMM')
),
renumbered as (
  select
    c.id,
    c.old_doc_no,
    'PRET' || c.ym || '-' || lpad((coalesce(em.max_seq, 0) + c.rn)::text, 4, '0') as new_doc_no
  from candidates c
  left join existing_max em on em.ym = c.ym
),
updated_returns as (
  update public.petty_advance_returns par
  set doc_no = r.new_doc_no
  from renumbered r
  where par.id = r.id
  returning r.old_doc_no, r.new_doc_no
)
update public.bank_statement bs
set
  ref_id = case when bs.ref_id = ur.old_doc_no then ur.new_doc_no else bs.ref_id end,
  ref_no = case when bs.ref_no = ur.old_doc_no then ur.new_doc_no else bs.ref_no end
from updated_returns ur
where bs.ref_type = 'PRET'
  and ur.old_doc_no is not null
  and (bs.ref_id = ur.old_doc_no or bs.ref_no = ur.old_doc_no);
