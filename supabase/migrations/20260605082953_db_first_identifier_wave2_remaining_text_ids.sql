begin;

create or replace function public.__wave2_assert_backfill(
  p_table text,
  p_old_column text,
  p_new_column text,
  p_allow_null_on_orphan boolean default false
)
returns void
language plpgsql
as $$
declare
  missing_count bigint;
begin
  execute format(
    'select count(*) from public.%I where %I is not null and %I is null',
    p_table,
    p_old_column,
    p_new_column
  )
  into missing_count;

  if missing_count > 0 and not p_allow_null_on_orphan then
    raise exception 'Wave 2 backfill failed for %.% -> % (% rows)', p_table, p_old_column, p_new_column, missing_count;
  end if;
end;
$$;

create temporary table __wave2_tables (
  table_name text primary key
) on commit drop;

insert into __wave2_tables (table_name)
values
  ('account_subtypes'),
  ('accounts'),
  ('assets'),
  ('bank_statement'),
  ('company_profiles'),
  ('currencies'),
  ('deletion_log'),
  ('deletion_tombstones'),
  ('depreciations'),
  ('director_employees'),
  ('expenses'),
  ('fx_gain_loss'),
  ('fx_rates'),
  ('grade_adjustments'),
  ('historical_monthly'),
  ('impurities'),
  ('loan_payments'),
  ('loan_schedules'),
  ('loans'),
  ('opening_balance'),
  ('overseas_recipients'),
  ('overseas_remittance_purposes'),
  ('payment_approvals'),
  ('payments'),
  ('petty_advance_returns'),
  ('petty_advances'),
  ('po_buy_status_logs'),
  ('po_buys'),
  ('po_sells'),
  ('process_costs'),
  ('production_inputs'),
  ('production_lines'),
  ('production_machine_types'),
  ('production_machines'),
  ('production_orders'),
  ('production_output_categories'),
  ('production_outputs'),
  ('products'),
  ('purchase_bill_items'),
  ('purchase_bill_po_allocations'),
  ('purchase_bill_receipt_allocations'),
  ('purchase_bills'),
  ('purchase_channels'),
  ('receipt_vouchers'),
  ('receipts'),
  ('roles'),
  ('sales_bills'),
  ('sales_channels'),
  ('stock_adjustments'),
  ('stock_issues'),
  ('stock_ledger'),
  ('supplier_advance_allocations'),
  ('supplier_advance_payments'),
  ('supplier_bank_accounts'),
  ('trading_deals'),
  ('transfers'),
  ('users'),
  ('vat_settings'),
  ('weight_ticket_lines'),
  ('weight_ticket_product_summaries'),
  ('weight_ticket_product_summary_lines'),
  ('weight_tickets'),
  ('wht_settings');

create temporary table __wave2_refs (
  src_table text not null,
  src_column text not null,
  target_table text not null,
  allow_null_on_orphan boolean not null default false,
  primary key (src_table, src_column)
) on commit drop;

insert into __wave2_refs (src_table, src_column, target_table, allow_null_on_orphan)
values
  ('assets', 'purchase_bill_id', 'purchase_bills', false),
  ('bank_statement', 'account_id', 'accounts', false),
  ('depreciations', 'asset_id', 'assets', false),
  ('expenses', 'account_id', 'accounts', false),
  ('grade_adjustments', 'product_id', 'products', false),
  ('loan_payments', 'account_id', 'accounts', false),
  ('loan_payments', 'loan_id', 'loans', false),
  ('loan_payments', 'schedule_id', 'loan_schedules', false),
  ('loan_schedules', 'loan_id', 'loans', false),
  ('payment_approvals', 'payment_id', 'payments', false),
  ('payments', 'account_id', 'accounts', false),
  ('payments', 'bill_id', 'purchase_bills', true),
  ('payments', 'payment_approval_id', 'payment_approvals', false),
  ('petty_advance_returns', 'account_id', 'accounts', false),
  ('petty_advance_returns', 'advance_id', 'petty_advances', false),
  ('petty_advances', 'account_id', 'accounts', false),
  ('po_buy_status_logs', 'po_buy_id', 'po_buys', false),
  ('po_buys', 'channel_id', 'purchase_channels', false),
  ('po_buys', 'product_id', 'products', false),
  ('po_sells', 'channel_id', 'sales_channels', false),
  ('po_sells', 'product_id', 'products', false),
  ('process_costs', 'production_order_id', 'production_orders', false),
  ('production_inputs', 'order_id', 'production_orders', false),
  ('production_inputs', 'product_id', 'products', false),
  ('production_orders', 'machine_id', 'production_machines', false),
  ('production_orders', 'product_id', 'products', false),
  ('production_orders', 'production_line_id', 'production_lines', false),
  ('production_outputs', 'order_id', 'production_orders', false),
  ('production_outputs', 'output_category', 'production_output_categories', false),
  ('production_outputs', 'product_id', 'products', false),
  ('purchase_bill_items', 'po_buy_id', 'po_buys', false),
  ('purchase_bill_items', 'product_id', 'products', false),
  ('purchase_bill_items', 'purchase_bill_id', 'purchase_bills', false),
  ('purchase_bill_po_allocations', 'po_buy_id', 'po_buys', false),
  ('purchase_bill_po_allocations', 'purchase_bill_id', 'purchase_bills', false),
  ('purchase_bill_po_allocations', 'purchase_bill_item_id', 'purchase_bill_items', false),
  ('purchase_bill_receipt_allocations', 'purchase_bill_id', 'purchase_bills', false),
  ('purchase_bill_receipt_allocations', 'purchase_bill_item_id', 'purchase_bill_items', false),
  ('purchase_bill_receipt_allocations', 'weight_ticket_id', 'weight_tickets', false),
  ('purchase_bill_receipt_allocations', 'weight_ticket_product_summary_id', 'weight_ticket_product_summaries', false),
  ('purchase_bills', 'po_buy_id', 'po_buys', false),
  ('receipt_vouchers', 'purchase_bill_id', 'purchase_bills', true),
  ('receipts', 'account_id', 'accounts', false),
  ('receipts', 'bill_id', 'sales_bills', false),
  ('sales_bills', 'channel_id', 'sales_channels', false),
  ('sales_bills', 'from_p_sale_id', 'po_sells', false),
  ('sales_bills', 'po_sell_id', 'po_sells', false),
  ('sales_bills', 'trading_from_purchase_id', 'purchase_bills', false),
  ('stock_adjustments', 'product_id', 'products', false),
  ('stock_adjustments', 'stock_ledger_id', 'stock_ledger', false),
  ('stock_issues', 'converted_to_bill_id', 'sales_bills', false),
  ('stock_ledger', 'output_product_id', 'products', false),
  ('stock_ledger', 'product_id', 'products', false),
  ('stock_ledger', 'purchase_channel_id', 'purchase_channels', false),
  ('stock_ledger', 'sales_channel_id', 'sales_channels', false),
  ('stock_ledger', 'source_input_product_id', 'products', false),
  ('supplier_advance_allocations', 'advance_payment_id', 'supplier_advance_payments', false),
  ('supplier_advance_allocations', 'purchase_bill_id', 'purchase_bills', false),
  ('supplier_advance_payments', 'funding_account_id', 'accounts', false),
  ('trading_deals', 'product_id', 'products', false),
  ('trading_deals', 'purchase_bill_id', 'purchase_bills', false),
  ('trading_deals', 'sales_bill_id', 'sales_bills', false),
  ('transfers', 'from_account_id', 'accounts', false),
  ('transfers', 'to_account_id', 'accounts', false),
  ('users', 'role_id', 'roles', true),
  ('weight_ticket_lines', 'impurity_id', 'impurities', false),
  ('weight_ticket_lines', 'product_id', 'products', false),
  ('weight_ticket_lines', 'weight_ticket_id', 'weight_tickets', false),
  ('weight_ticket_product_summaries', 'product_id', 'products', false),
  ('weight_ticket_product_summaries', 'weight_ticket_id', 'weight_tickets', false),
  ('weight_ticket_product_summary_lines', 'summary_id', 'weight_ticket_product_summaries', false),
  ('weight_ticket_product_summary_lines', 'weight_ticket_line_id', 'weight_ticket_lines', false);

create temporary table __wave2_target_columns (
  table_name text not null,
  column_name text not null,
  primary key (table_name, column_name)
) on commit drop;

insert into __wave2_target_columns (table_name, column_name)
select table_name, 'id' from __wave2_tables
union all
select src_table, src_column from __wave2_refs;

create temporary table __wave2_ref_nullability (
  src_table text not null,
  src_column text not null,
  was_nullable boolean not null,
  primary key (src_table, src_column)
) on commit drop;

insert into __wave2_ref_nullability (src_table, src_column, was_nullable)
select
  c.table_name,
  c.column_name,
  c.is_nullable = 'YES'
from information_schema.columns c
join __wave2_refs r
  on r.src_table = c.table_name
 and r.src_column = c.column_name
where c.table_schema = 'public';

-- Add missing business codes where the legacy string id is the existing business key.
alter table public.accounts add column if not exists code text;
update public.accounts set code = upper(id) where code is null;
alter table public.currencies add column if not exists code text;
update public.currencies set code = upper(id) where code is null;
alter table public.impurities add column if not exists code text;
update public.impurities set code = upper(id) where code is null;
alter table public.purchase_channels add column if not exists code text;
update public.purchase_channels set code = upper(id) where code is null;
alter table public.sales_channels add column if not exists code text;
update public.sales_channels set code = upper(id) where code is null;
alter table public.overseas_remittance_purposes add column if not exists code text;
update public.overseas_remittance_purposes set code = upper(id) where code is null;

do $$
begin
  if exists (select 1 from public.accounts where code is null) then
    raise exception 'accounts.code contains null after backfill';
  end if;
  if exists (select 1 from public.currencies where code is null) then
    raise exception 'currencies.code contains null after backfill';
  end if;
  if exists (select 1 from public.impurities where code is null) then
    raise exception 'impurities.code contains null after backfill';
  end if;
  if exists (select 1 from public.purchase_channels where code is null) then
    raise exception 'purchase_channels.code contains null after backfill';
  end if;
  if exists (select 1 from public.sales_channels where code is null) then
    raise exception 'sales_channels.code contains null after backfill';
  end if;
  if exists (select 1 from public.overseas_remittance_purposes where code is null) then
    raise exception 'overseas_remittance_purposes.code contains null after backfill';
  end if;
end;
$$;

create unique index if not exists accounts_code_key on public.accounts (code);
create unique index if not exists currencies_code_key on public.currencies (code);
create unique index if not exists impurities_code_key on public.impurities (code);
create unique index if not exists purchase_channels_code_key on public.purchase_channels (code);
create unique index if not exists sales_channels_code_key on public.sales_channels (code);
create unique index if not exists overseas_remittance_purposes_code_key on public.overseas_remittance_purposes (code);

alter table public.loans add column if not exists contract_no text;
update public.loans set contract_no = upper(id) where contract_no is null;
create unique index if not exists loans_contract_no_key on public.loans (contract_no);

alter table public.trading_deals add column if not exists deal_no text;
update public.trading_deals set deal_no = upper(id) where deal_no is null;
create index if not exists idx_trading_deals_deal_no on public.trading_deals (deal_no);

do $$
declare
  r record;
begin
  for r in select table_name from __wave2_tables loop
    execute format(
      'alter table public.%I add column id_new bigint generated by default as identity',
      r.table_name
    );
  end loop;
end;
$$;

do $$
declare
  r record;
begin
  for r in select src_table, src_column from __wave2_refs loop
    execute format(
      'alter table public.%I add column %I bigint',
      r.src_table,
      r.src_column || '_new'
    );
  end loop;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select src_table, src_column, target_table
    from __wave2_refs
  loop
    execute format(
      'update public.%I src set %I = tgt.id_new from public.%I tgt where src.%I = tgt.id',
      r.src_table,
      r.src_column || '_new',
      r.target_table,
      r.src_column
    );
  end loop;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select src_table, src_column, allow_null_on_orphan
    from __wave2_refs
  loop
    perform public.__wave2_assert_backfill(
      r.src_table,
      r.src_column,
      r.src_column || '_new',
      r.allow_null_on_orphan
    );
  end loop;
end;
$$;

create temporary table __wave2_saved_constraints (
  table_name text not null,
  constraint_name text not null,
  contype "char" not null,
  ddl text not null,
  primary key (table_name, constraint_name)
) on commit drop;

insert into __wave2_saved_constraints (table_name, constraint_name, contype, ddl)
select
  tbl.relname as table_name,
  con.conname as constraint_name,
  con.contype,
  format(
    'alter table public.%I add constraint %I %s',
    tbl.relname,
    con.conname,
    pg_get_constraintdef(con.oid, true)
  ) as ddl
from pg_constraint con
join pg_class tbl
  on tbl.oid = con.conrelid
join pg_namespace ns
  on ns.oid = tbl.relnamespace
where ns.nspname = 'public'
  and con.contype in ('p', 'u', 'f')
  and exists (
    select 1
    from unnest(con.conkey) as ck(attnum)
    join pg_attribute a
      on a.attrelid = tbl.oid
     and a.attnum = ck.attnum
    join __wave2_target_columns tc
      on tc.table_name = tbl.relname
     and tc.column_name = a.attname
  );

update __wave2_saved_constraints
set ddl = 'alter table public.production_outputs add constraint production_outputs_output_category_fkey foreign key (output_category) references public.production_output_categories(id) on update cascade on delete restrict'
where table_name = 'production_outputs'
  and constraint_name = 'production_outputs_output_category_fkey';

create temporary table __wave2_saved_indexes (
  table_name text not null,
  index_name text not null,
  ddl text not null,
  primary key (table_name, index_name)
) on commit drop;

insert into __wave2_saved_indexes (table_name, index_name, ddl)
select distinct
  tbl.relname as table_name,
  idxcls.relname as index_name,
  pg_get_indexdef(idxcls.oid) as ddl
from pg_index idx
join pg_class idxcls
  on idxcls.oid = idx.indexrelid
join pg_class tbl
  on tbl.oid = idx.indrelid
join pg_namespace ns
  on ns.oid = tbl.relnamespace
join lateral unnest(idx.indkey) as cols(attnum)
  on true
join pg_attribute a
  on a.attrelid = tbl.oid
 and a.attnum = cols.attnum
join __wave2_target_columns tc
  on tc.table_name = tbl.relname
 and tc.column_name = a.attname
left join pg_constraint con
  on con.conindid = idx.indexrelid
where ns.nspname = 'public'
  and con.oid is null;

do $$
declare
  r record;
begin
  for r in
    select table_name, constraint_name
    from __wave2_saved_constraints
    order by case contype when 'f' then 1 when 'u' then 2 when 'p' then 3 else 9 end
  loop
    execute format(
      'alter table public.%I drop constraint %I',
      r.table_name,
      r.constraint_name
    );
  end loop;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select index_name
    from __wave2_saved_indexes
  loop
    execute format('drop index public.%I', r.index_name);
  end loop;
end;
$$;

do $$
declare
  r record;
  nullable_record record;
begin
  for r in
    select src_table, src_column
    from __wave2_refs
  loop
    execute format(
      'alter table public.%I drop column %I',
      r.src_table,
      r.src_column
    );
    execute format(
      'alter table public.%I rename column %I to %I',
      r.src_table,
      r.src_column || '_new',
      r.src_column
    );

    select *
    into nullable_record
    from __wave2_ref_nullability
    where src_table = r.src_table
      and src_column = r.src_column;

    if nullable_record.was_nullable = false then
      execute format(
        'alter table public.%I alter column %I set not null',
        r.src_table,
        r.src_column
      );
    end if;
  end loop;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select table_name
    from __wave2_tables
  loop
    execute format('alter table public.%I drop column id', r.table_name);
    execute format('alter table public.%I rename column id_new to id', r.table_name);
  end loop;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select ddl
    from __wave2_saved_constraints
    where contype in ('p', 'u')
    order by case contype when 'p' then 1 when 'u' then 2 else 9 end, table_name, constraint_name
  loop
    execute r.ddl;
  end loop;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select ddl
    from __wave2_saved_constraints
    where contype = 'f'
    order by table_name, constraint_name
  loop
    execute r.ddl;
  end loop;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select ddl
    from __wave2_saved_indexes
    order by table_name, index_name
  loop
    execute r.ddl;
  end loop;
end;
$$;

drop function if exists public.__wave2_assert_backfill(text, text, text, boolean);

commit;
