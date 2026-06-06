update public.payment_approvals pa
set source_id = pb.id::text
from public.purchase_bills pb
where pa.source_type = 'purchase_bill'
  and pa.source_doc_no_snapshot = pb.doc_no
  and pa.source_id !~ '^[0-9]+$';

update public.payment_approvals pa
set source_id = adv.id::text
from public.supplier_advance_payments adv
where pa.source_type = 'advance_payment'
  and pa.source_doc_no_snapshot = adv.doc_no
  and pa.source_id !~ '^[0-9]+$';
