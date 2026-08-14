-- Realtime topics use the public branch code (for example, `01`), while
-- app_user_branch_access stores the internal bigint branch id (for example, 1).
-- Read the RLS-protected access tables through a narrowly scoped definer
-- function and resolve the topic code through branches.code.
create or replace function public.can_read_weight_ticket_realtime(_branch_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users users
    where users.auth_user_id = auth.uid()
      and users.active = true
      and (
        not exists (
          select 1
          from public.app_user_branch_access access_all
          where access_all.user_id = users.id
        )
        or exists (
          select 1
          from public.app_user_branch_access access_branch
          join public.branches branch on branch.id = access_branch.branch_id
          where access_branch.user_id = users.id
            and branch.code = _branch_code
        )
      )
  );
$$;

revoke all on function public.can_read_weight_ticket_realtime(text) from public;
revoke all on function public.can_read_weight_ticket_realtime(text) from anon;
grant execute on function public.can_read_weight_ticket_realtime(text) to authenticated;

drop policy if exists "weight ticket realtime branch read" on realtime.messages;

create policy "weight ticket realtime branch read"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() like 'weight-ticket-updates:%'
  and public.can_read_weight_ticket_realtime(split_part(realtime.topic(), ':', 2))
);
