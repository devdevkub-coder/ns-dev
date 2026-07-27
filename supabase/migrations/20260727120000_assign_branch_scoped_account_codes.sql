-- Company account business codes are branch-scoped and are the outward key
-- used by finance flows. bank_statement.account_id remains the internal FK.
begin;

do $$
declare
  missing_branch_count integer;
  invalid_branch_code_count integer;
begin
  select count(*) into missing_branch_count
  from public.accounts
  where branch_id is null;

  if missing_branch_count > 0 then
    raise exception 'accounts migration stopped: % account(s) have no branch_id', missing_branch_count;
  end if;

  select count(*) into invalid_branch_code_count
  from public.accounts a
  join public.branches b on b.id = a.branch_id
  where b.code is null or b.code !~ '^[A-Za-z0-9_-]+$';

  if invalid_branch_code_count > 0 then
    raise exception 'accounts migration stopped: % account(s) have an invalid branch code', invalid_branch_code_count;
  end if;
end;
$$;

-- Move every row to a temporary unique namespace before assigning the final
-- codes so an existing unique index cannot collide during the remap.
update public.accounts
set code = '__ACCOUNT_CODE_REMAP__' || id::text;

with numbered_accounts as (
  select
    a.id,
    b.code as branch_code,
    row_number() over (partition by a.branch_id order by a.id) as sequence_no
  from public.accounts a
  join public.branches b on b.id = a.branch_id
)
update public.accounts a
set code = 'ACC' || numbered_accounts.branch_code || '-' || lpad(numbered_accounts.sequence_no::text, 3, '0')
from numbered_accounts
where a.id = numbered_accounts.id;

commit;
