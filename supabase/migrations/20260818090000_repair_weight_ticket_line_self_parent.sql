begin;

/*
 * A parent relation groups lines; it is not a permanent, undeletable root.
 * Repair only the invalid self-reference that can be derived from persisted
 * data.  The preceding line must be the immediately previous real lot in the
 * same product/warehouse section. If that evidence is missing,
 * stop the migration instead of inventing a parent or silently clearing it.
 */
do $$
declare
  unresolved text;
begin
  with self_references as (
    select
      line.id,
      line.weight_ticket_id,
      line.line_no,
      line.product_id,
      line.warehouse_id
    from public.weight_ticket_lines as line
    where line.parent_line_no = line.line_no
  ), candidates as (
    select
      self_reference.id,
      self_reference.weight_ticket_id,
      self_reference.line_no,
      (
        select parent.line_no
        from public.weight_ticket_lines as parent
        where parent.weight_ticket_id = self_reference.weight_ticket_id
          and parent.line_no = self_reference.line_no - 1
          and parent.product_id = self_reference.product_id
          and parent.warehouse_id is not distinct from self_reference.warehouse_id
          and parent.deduction_mode = 'none'
          and parent.impurity_source_line_no is null
          and parent.parent_line_no is distinct from parent.line_no
      ) as replacement_parent_line_no
    from self_references as self_reference
  )
  select string_agg(
    format('weight_ticket_lines.id=%s (weight_ticket_id=%s, line_no=%s)', id, weight_ticket_id, line_no),
    ', '
    order by weight_ticket_id, line_no
  )
  into unresolved
  from candidates
  where replacement_parent_line_no is null;

  if unresolved is not null then
    raise exception
      'Cannot repair self-parent weight-ticket lines without a derived preceding real lot: %',
      unresolved;
  end if;

  with self_references as (
    select
      line.id,
      line.weight_ticket_id,
      line.line_no,
      line.product_id,
      line.warehouse_id
    from public.weight_ticket_lines as line
    where line.parent_line_no = line.line_no
  ), candidates as (
    select
      self_reference.id,
      self_reference.weight_ticket_id,
      self_reference.line_no,
      (
        select parent.line_no
        from public.weight_ticket_lines as parent
        where parent.weight_ticket_id = self_reference.weight_ticket_id
          and parent.line_no = self_reference.line_no - 1
          and parent.product_id = self_reference.product_id
          and parent.warehouse_id is not distinct from self_reference.warehouse_id
          and parent.deduction_mode = 'none'
          and parent.impurity_source_line_no is null
          and parent.parent_line_no is distinct from parent.line_no
      ) as replacement_parent_line_no
    from self_references as self_reference
  )
  update public.weight_ticket_lines as line
  set parent_line_no = candidates.replacement_parent_line_no,
      updated_at = now()
  from candidates
  where line.id = candidates.id;
end;
$$;

commit;

begin;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.weight_ticket_lines'::regclass
      and conname = 'weight_ticket_lines_parent_line_no_not_self'
  ) then
    alter table public.weight_ticket_lines
      add constraint weight_ticket_lines_parent_line_no_not_self
      check (parent_line_no is null or parent_line_no <> line_no);
  end if;
end;
$$;

commit;
