-- Weight-ticket broadcasts are private and branch-scoped. Clients may receive
-- events only for branches already granted to their app user. The service role
-- used by the server publisher bypasses this read policy; clients have no send
-- policy and therefore cannot spoof broadcasts.
create policy "weight ticket realtime branch read"
on realtime.messages
for select
to authenticated
using (
  topic() like 'weight-ticket-updates:%'
  and exists (
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
          where access_branch.user_id = users.id
            and access_branch.branch_id::text = split_part(topic(), ':', 2)
        )
      )
  )
);
