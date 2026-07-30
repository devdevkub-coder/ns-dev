import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'

const connectionString = process.env.FCD_LOCK_TEST_DATABASE_URL
if (!connectionString) {
  throw new Error('ต้องกำหนด FCD_LOCK_TEST_DATABASE_URL สำหรับตรวจ FCD lock concurrency')
}

const pool = new Pool({ connectionString, max: 4 })
const runId = randomUUID().replaceAll('-', '')
let fixtureAccountId = null

async function createFixture(client) {
  const policy = await client.query(`
    select functional_currency_code
    from public.finance_currency_policies
  `)
  if (policy.rowCount !== 1) throw new Error('finance_currency_policies ต้องมี 1 แถวสำหรับ FCD lock fixture')
  const functionalCurrency = policy.rows[0].functional_currency_code
  const currency = await client.query(`
    select code
    from public.currencies
    where code <> $1
    order by code
    limit 1
  `, [functionalCurrency])
  if (currency.rowCount !== 1) throw new Error('ไม่พบสกุลเงินต่างประเทศสำหรับ FCD lock fixture')
  const bankCategory = await client.query(`
    select code
    from public.account_categories
    where account_group = 'bank' and active = true
    order by sort_order, code
    limit 1
  `)
  if (bankCategory.rowCount !== 1) throw new Error('ไม่พบหมวดบัญชีธนาคารสำหรับ FCD lock fixture')

  const created = await client.query(`
    insert into public.accounts (
      code, name, type, account_group, bank_account_type, is_fcd,
      bank_name, account_no, currency, opening_balance, od_limit, active, updated_by
    ) values ($1, $2, $3, $4, 'savings', true, $5, $6, $7, 0, 0, true, $8)
    returning id
  `, [
    `FCDLOCK${runId.slice(0, 12).toUpperCase()}`,
    `FCD lock fixture ${runId}`,
    'bank',
    bankCategory.rows[0].code,
    'FCD integration fixture',
    runId,
    currency.rows[0].code,
    'fcd-lock-verifier',
  ])
  fixtureAccountId = created.rows[0].id
  await client.query(`
    insert into public.account_currency_balances (account_id, currency_code, active)
    values ($1, $2, true), ($1, $3, true)
  `, [fixtureAccountId, functionalCurrency, currency.rows[0].code])
  return { currencyCode: currency.rows[0].code }
}

async function lock(client, currencyCode) {
  await client.query(`
    select pg_advisory_xact_lock(
      hashtext('fcd-account-currency'),
      hashtext($1 || ':' || $2)
    )
  `, [String(fixtureAccountId), currencyCode])
}

async function main() {
  const setup = await pool.connect()
  const first = await pool.connect()
  const second = await pool.connect()
  try {
    await setup.query('begin')
    const { currencyCode } = await createFixture(setup)
    await setup.query('commit')

    await first.query('begin')
    await lock(first, currencyCode)

    await second.query('begin')
    let secondAcquired = false
    const waitingLock = lock(second, currencyCode).then(() => { secondAcquired = true })
    await new Promise((resolve) => setTimeout(resolve, 150))
    if (secondAcquired) throw new Error('FCD lock ไม่ serialize transaction เดียวกัน')

    await first.query('commit')
    await waitingLock
    if (!secondAcquired) throw new Error('FCD lock ไม่ถูกปล่อยหลัง transaction แรก commit')
    await second.query('commit')
    process.stdout.write(`FCD account+currency advisory lock verified for account ${fixtureAccountId}\n`)
  } finally {
    await first.query('rollback').catch(() => undefined)
    await second.query('rollback').catch(() => undefined)
    if (fixtureAccountId != null) {
      await setup.query('begin')
      await setup.query('delete from public.accounts where id = $1', [fixtureAccountId])
      await setup.query('commit')
    }
    first.release()
    second.release()
    setup.release()
    await pool.end()
  }
}

await main()
