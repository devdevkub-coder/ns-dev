import pg from 'pg'

const databaseUrl = process.env.DATABASE_URL
const adminEmail = process.env.APP_ADMIN_EMAIL || process.env.DEV_LOGIN_IDENTIFIER
const adminUsername = process.env.APP_ADMIN_USERNAME || adminEmail?.split('@')[0]
const adminDisplayName = process.env.APP_ADMIN_DISPLAY_NAME || adminEmail

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.')
}

if (!adminEmail || !adminEmail.includes('@')) {
  throw new Error('APP_ADMIN_EMAIL or DEV_LOGIN_IDENTIFIER must be an email address.')
}

const client = new pg.Client({ connectionString: databaseUrl })

await client.connect()

try {
  await client.query('begin')

  const authUserResult = await client.query(
    `
      select id, email
      from auth.users
      where lower(email) = lower($1)
        and deleted_at is null
      order by created_at desc
      limit 1
    `,
    [adminEmail],
  )

  const authUser = authUserResult.rows[0]

  if (!authUser) {
    throw new Error(`No Supabase Auth user found for ${adminEmail}.`)
  }

  const appUserResult = await client.query(
    `
      with existing as (
        select id
        from public.app_users
        where auth_user_id = $1::uuid
           or lower(email) = lower($2)
        order by created_at desc
        limit 1
      ),
      updated as (
        update public.app_users
        set auth_user_id = $1::uuid,
            username = coalesce(nullif(username, ''), $3),
            display_name = coalesce(nullif(display_name, ''), $4),
            email = $2,
            active = true,
            updated_by = 'seed-app-admin'
        where id in (select id from existing)
        returning id
      ),
      inserted as (
        insert into public.app_users (
          auth_user_id,
          username,
          display_name,
          email,
          active,
          created_by,
          updated_by
        )
        select $1::uuid, $3, $4, $2, true, 'seed-app-admin', 'seed-app-admin'
        where not exists (select 1 from updated)
        returning id
      )
      select id from updated
      union all
      select id from inserted
      limit 1
    `,
    [authUser.id, authUser.email, adminUsername, adminDisplayName],
  )

  const appUserId = appUserResult.rows[0]?.id

  if (!appUserId) {
    throw new Error(`Failed to upsert app user for ${adminEmail}.`)
  }

  const roleResult = await client.query(
    `
      select id
      from public.app_roles
      where code = 'admin'
      limit 1
    `,
  )

  const adminRoleId = roleResult.rows[0]?.id

  if (!adminRoleId) {
    throw new Error('Admin role does not exist. Run the auth permission schema migration first.')
  }

  await client.query(
    `
      insert into public.app_user_roles (user_id, role_id, created_by)
      values ($1::uuid, $2::uuid, 'seed-app-admin')
      on conflict do nothing
    `,
    [appUserId, adminRoleId],
  )

  await client.query('commit')
  console.log(`Seeded admin app user for ${authUser.email}.`)
} catch (caught) {
  await client.query('rollback')
  throw caught
} finally {
  await client.end()
}
