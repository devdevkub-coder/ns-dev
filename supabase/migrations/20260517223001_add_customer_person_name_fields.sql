-- Add explicit person-name columns for individual customers and contact persons.
-- Additive/non-destructive: existing customer.name and customer.contact are preserved.

alter table public.customers
  add column if not exists name_title text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists contact_title text,
  add column if not exists contact_first_name text,
  add column if not exists contact_last_name text;

comment on column public.customers.name_title is 'Title/prefix for individual customer name.';
comment on column public.customers.first_name is 'First name for individual customer.';
comment on column public.customers.last_name is 'Last name for individual customer.';
comment on column public.customers.contact_title is 'Title/prefix for customer contact person.';
comment on column public.customers.contact_first_name is 'First name for customer contact person.';
comment on column public.customers.contact_last_name is 'Last name for customer contact person.';
