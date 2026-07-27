alter table public.petty_advances
  add column if not exists branch_id bigint;

create index if not exists idx_petty_advances_branch
  on public.petty_advances (branch_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'petty_advances_branch_id_fkey'
  ) then
    alter table public.petty_advances
      add constraint petty_advances_branch_id_fkey
      foreign key (branch_id) references public.branches(id);
  end if;
end $$;
