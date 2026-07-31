begin;

do $$
declare
  cash_method_id bigint;
  bank_transfer_method_id bigint;
begin
  select id
  into cash_method_id
  from public.payment_methods
  where code = 'PM-001'
    and type = 'cash';

  select id
  into bank_transfer_method_id
  from public.payment_methods
  where code = 'PM-002'
    and type = 'bank';

  if cash_method_id is null then
    raise exception 'Payment Method Master must contain PM-001 with type cash';
  end if;

  if bank_transfer_method_id is null then
    raise exception 'Payment Method Master must contain PM-002 with type bank';
  end if;

  update public.payment_methods
  set active = id in (cash_method_id, bank_transfer_method_id),
      updated_at = now();

  if (select count(*) from public.payment_methods where active and type = 'cash') <> 1 then
    raise exception 'Payment Method Master must retain exactly one active cash method';
  end if;

  if (select count(*) from public.payment_methods where active and type = 'bank') <> 1 then
    raise exception 'Payment Method Master must retain exactly one active bank method';
  end if;
end $$;

commit;
