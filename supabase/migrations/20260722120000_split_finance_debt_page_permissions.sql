-- Split finance & debt page visibility from the legacy finance.cash.view grant.
-- Existing grants are copied as defaults so current users keep access until an
-- administrator explicitly removes a page permission from a role or user.
insert into public.app_permissions (code, module, resource, action, description)
values
  ('finance.debt_trading_matching.view', 'finance', 'debt_trading_matching', 'view', 'เห็นหน้า Trading Matching / จับคู่ดีล'),
  ('finance.debt_payments.view', 'finance', 'debt_payments', 'view', 'เห็นหน้าจ่ายเงิน'),
  ('finance.debt_receipts.view', 'finance', 'debt_receipts', 'view', 'เห็นหน้ารับเงิน Customer'),
  ('finance.debt_transfers.view', 'finance', 'debt_transfers', 'view', 'เห็นหน้าโอนเงินระหว่างบัญชี'),
  ('finance.debt_ar.view', 'finance', 'debt_ar', 'view', 'เห็นหน้าลูกหนี้ (AR)'),
  ('finance.debt_ap.view', 'finance', 'debt_ap', 'view', 'เห็นหน้าเจ้าหนี้ (AP)'),
  ('finance.debt_bank.view', 'finance', 'debt_bank', 'view', 'เห็นหน้า Cash / Bank Statement'),
  ('finance.debt_cash_position.view', 'finance', 'debt_cash_position', 'view', 'เห็นหน้า Cash Position')
on conflict (code) do update set
  module = excluded.module,
  resource = excluded.resource,
  action = excluded.action,
  description = excluded.description,
  active = true,
  updated_at = now();

insert into public.app_role_permissions (role_id, permission_id, created_by)
select distinct legacy_assignment.role_id, target_permission.id, 'migration'
from public.app_role_permissions legacy_assignment
join public.app_permissions legacy_permission
  on legacy_permission.id = legacy_assignment.permission_id
join public.app_permissions target_permission
  on target_permission.code in (
    'finance.debt_trading_matching.view',
    'finance.debt_payments.view',
    'finance.debt_receipts.view',
    'finance.debt_transfers.view',
    'finance.debt_ar.view',
    'finance.debt_ap.view',
    'finance.debt_bank.view',
    'finance.debt_cash_position.view'
  )
where legacy_permission.code = 'finance.cash.view'
on conflict do nothing;

insert into public.app_user_permission_overrides (
  user_id,
  permission_id,
  effect,
  created_by,
  updated_by
)
select distinct legacy_override.user_id, target_permission.id, legacy_override.effect, 'migration', 'migration'
from public.app_user_permission_overrides legacy_override
join public.app_permissions legacy_permission
  on legacy_permission.id = legacy_override.permission_id
join public.app_permissions target_permission
  on target_permission.code in (
    'finance.debt_trading_matching.view',
    'finance.debt_payments.view',
    'finance.debt_receipts.view',
    'finance.debt_transfers.view',
    'finance.debt_ar.view',
    'finance.debt_ap.view',
    'finance.debt_bank.view',
    'finance.debt_cash_position.view'
  )
where legacy_permission.code = 'finance.cash.view'
on conflict (user_id, permission_id) do nothing;
