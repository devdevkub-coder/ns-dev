alter table public.weight_tickets
  add column if not exists container_deduction_weight numeric not null default 0;

alter table public.weight_ticket_lines
  add column if not exists container_deduction_weight numeric not null default 0;

alter table public.weight_ticket_product_summaries
  add column if not exists container_deduction_weight numeric not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'weight_tickets_container_deduction_weight_nonnegative'
      and conrelid = 'public.weight_tickets'::regclass
  ) then
    alter table public.weight_tickets
      add constraint weight_tickets_container_deduction_weight_nonnegative
      check (container_deduction_weight >= 0) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'weight_ticket_lines_container_deduction_weight_nonnegative'
      and conrelid = 'public.weight_ticket_lines'::regclass
  ) then
    alter table public.weight_ticket_lines
      add constraint weight_ticket_lines_container_deduction_weight_nonnegative
      check (container_deduction_weight >= 0) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'weight_ticket_product_summaries_container_deduction_weight_nonnegative'
      and conrelid = 'public.weight_ticket_product_summaries'::regclass
  ) then
    alter table public.weight_ticket_product_summaries
      add constraint weight_ticket_product_summaries_container_deduction_weight_nonnegative
      check (container_deduction_weight >= 0) not valid;
  end if;
end $$;

alter table public.weight_tickets
  validate constraint weight_tickets_container_deduction_weight_nonnegative;

alter table public.weight_ticket_lines
  validate constraint weight_ticket_lines_container_deduction_weight_nonnegative;

alter table public.weight_ticket_product_summaries
  validate constraint weight_ticket_product_summaries_container_deduction_weight_nonnegative;
