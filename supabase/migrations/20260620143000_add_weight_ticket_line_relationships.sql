alter table public.weight_ticket_lines
  add column if not exists parent_line_no integer,
  add column if not exists impurity_source_line_no integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'weight_ticket_lines_parent_line_no_self_fk'
      and conrelid = 'public.weight_ticket_lines'::regclass
  ) then
    alter table public.weight_ticket_lines
      add constraint weight_ticket_lines_parent_line_no_self_fk
      foreign key (weight_ticket_id, parent_line_no)
      references public.weight_ticket_lines(weight_ticket_id, line_no)
      on update cascade
      on delete set null
      deferrable initially deferred;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'weight_ticket_lines_impurity_source_line_no_self_fk'
      and conrelid = 'public.weight_ticket_lines'::regclass
  ) then
    alter table public.weight_ticket_lines
      add constraint weight_ticket_lines_impurity_source_line_no_self_fk
      foreign key (weight_ticket_id, impurity_source_line_no)
      references public.weight_ticket_lines(weight_ticket_id, line_no)
      on update cascade
      on delete set null
      deferrable initially deferred;
  end if;
end $$;

create index if not exists idx_weight_ticket_lines_parent_line
  on public.weight_ticket_lines(weight_ticket_id, parent_line_no)
  where parent_line_no is not null;

create index if not exists idx_weight_ticket_lines_impurity_source_line
  on public.weight_ticket_lines(weight_ticket_id, impurity_source_line_no)
  where impurity_source_line_no is not null;

comment on column public.weight_ticket_lines.parent_line_no is
  'Line number of the parent product/lot row for child lots and impurity deduction rows within the same weight ticket.';

comment on column public.weight_ticket_lines.impurity_source_line_no is
  'Line number of the source impurity deduction row when this line is a bought product created from impurity purchase.';
