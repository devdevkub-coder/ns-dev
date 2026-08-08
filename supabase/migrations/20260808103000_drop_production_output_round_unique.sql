-- One production round may contain multiple output lines, including a loss line.
-- output_round is not a row-level key and must not be unique per production order.
drop index if exists public.uq_production_outputs_order_round;
