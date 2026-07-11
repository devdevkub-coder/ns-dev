alter table public.app_users
  add column if not exists department_id bigint;

alter table public.app_users
  drop constraint if exists app_users_department_id_fkey;

alter table public.app_users
  add constraint app_users_department_id_fkey
  foreign key (department_id)
  references public.departments(id)
  on update no action
  on delete set null;

create index if not exists idx_app_users_department_id
  on public.app_users(department_id);

comment on column public.app_users.department_id is
  'Primary department for the application user. Role remains permission-based; department represents organizational affiliation.';

with role_department_map(role_code, department_name) as (
  values
    ('accountant', 'บัญชี'),
    ('account_expense', 'บัญชี'),
    ('warehouse', 'คลังสินค้า'),
    ('production_department', 'โรงงาน'),
    ('sorting_department', 'โรงงาน'),
    ('admin', 'IT')
),
ranked_matches as (
  select
    au.id as user_id,
    d.id as department_id,
    row_number() over (
      partition by au.id
      order by case rdm.role_code
        when 'admin' then 1
        when 'accountant' then 2
        when 'account_expense' then 3
        when 'warehouse' then 4
        when 'production_department' then 5
        when 'sorting_department' then 6
        else 99
      end
    ) as rn
  from public.app_users au
  join public.app_user_roles aur on aur.user_id = au.id
  join public.app_roles ar on ar.id = aur.role_id
  join role_department_map rdm on rdm.role_code = ar.code
  join public.departments d on d.name = rdm.department_name
  where au.department_id is null
)
update public.app_users au
set department_id = ranked_matches.department_id
from ranked_matches
where ranked_matches.user_id = au.id
  and ranked_matches.rn = 1;
