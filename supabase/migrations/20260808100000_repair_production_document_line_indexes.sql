-- A production document can contain multiple input/output lines.
-- Keep document numbers indexed for lookup, but do not make them unique per row.
-- The document number is the group key; the line is identified by its row id.

drop index if exists public.idx_production_inputs_doc_no;
create index if not exists idx_production_inputs_doc_no
  on public.production_inputs(doc_no);

drop index if exists public.idx_production_outputs_doc_no;
create index if not exists idx_production_outputs_doc_no
  on public.production_outputs(doc_no);
