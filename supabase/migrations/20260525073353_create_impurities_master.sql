create table if not exists public.impurities (
  id text primary key,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint impurities_name_not_blank check (length(btrim(name)) > 0),
  constraint impurities_name_length check (char_length(btrim(name)) <= 180),
  constraint impurities_name_no_control_chars check (name !~ '[[:cntrl:]]')
);

create unique index if not exists impurities_name_unique_idx
  on public.impurities (lower(btrim(name)));

create index if not exists impurities_active_idx on public.impurities(active);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_impurities_updated_at' and tgrelid = 'public.impurities'::regclass) then
    create trigger set_impurities_updated_at
    before update on public.impurities
    for each row execute function public.update_updated_at_column();
  end if;
end;
$$;

alter table public.impurities enable row level security;
