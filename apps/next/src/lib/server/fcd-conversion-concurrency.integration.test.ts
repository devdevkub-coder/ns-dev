import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { postFcdConversion } from './fcd-conversion-posting'
import { prisma } from './prisma'

const enabled = process.env.FCD_WRITE_INTEGRATION_TEST === '1'
const actor = `fcd-concurrency-test:${randomUUID()}`
let sourceAccountId: bigint
let sourceAccountCode: string
let destinationAccountId: bigint
let destinationAccountCode: string
let branchId: bigint
let foreignCurrencyCode: string

describe.runIf(enabled)('FCD conversion concurrency integration', () => {
  beforeAll(async () => {
    const [policy, branch, category] = await Promise.all([
      prisma.finance_currency_policies.findMany({ select: { functional_currency_code: true }, take: 2 }),
      prisma.branches.findFirst({ select: { id: true }, where: { active: true } }),
      prisma.account_categories.findFirst({ select: { code: true }, where: { account_group: 'bank', active: true } }),
    ])
    if (policy.length !== 1 || !branch || !category) throw new Error('FCD concurrency fixture ไม่มี policy, branch หรือ bank category ที่ใช้งานได้')
    const currency = await prisma.currencies.findFirst({ orderBy: { code: 'asc' }, select: { code: true }, where: { code: { not: policy[0]!.functional_currency_code } } })
    if (!currency) throw new Error('FCD concurrency fixture ไม่มีสกุลเงินต่างประเทศ')
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()
    sourceAccountCode = `FCDT${suffix}`
    destinationAccountCode = `BNKT${suffix}`
    branchId = branch.id
    foreignCurrencyCode = currency.code

    await prisma.$transaction(async (tx) => {
      const [source, destination] = await Promise.all([
        tx.accounts.create({ data: { account_group: category.code, account_no: `FCD-${suffix}`, active: true, bank_account_type: 'current', bank_name: 'FCD test bank', code: sourceAccountCode, currency: foreignCurrencyCode, is_fcd: true, name: `FCD concurrency ${suffix}`, od_limit: 1_000_000, opening_balance: 0, type: 'bank', updated_by: actor } }),
        tx.accounts.create({ data: { account_group: category.code, account_no: `THB-${suffix}`, active: true, bank_account_type: 'savings', bank_name: 'THB test bank', code: destinationAccountCode, currency: policy[0]!.functional_currency_code, is_fcd: false, name: `THB concurrency ${suffix}`, od_limit: 0, opening_balance: 0, type: 'bank', updated_by: actor } }),
      ])
      sourceAccountId = source.id
      destinationAccountId = destination.id
      await tx.account_currency_balances.createMany({ data: [
        { account_id: source.id, currency_code: foreignCurrencyCode },
        { account_id: source.id, currency_code: policy[0]!.functional_currency_code },
        { account_id: destination.id, currency_code: policy[0]!.functional_currency_code },
      ] })
      await tx.fcd_ledger_entries.create({ data: { account_id: source.id, branch_id: branch.id, carrying_thb_in: 3500, carrying_thb_out: 0, created_by: actor, currency_code: foreignCurrencyCode, entry_date: new Date('2026-07-01'), fx_rate: 35, idempotency_key: `${actor}:opening`, native_amount_in: 100, native_amount_out: 0, source_event_key: `${actor}:opening`, source_event_type: 'fcd_test_opening' } })
    })
  })

  afterAll(async () => {
    if (!sourceAccountId || !destinationAccountId) return
    await prisma.$transaction(async (tx) => {
      // This fixture creates append-only rows. Disable only user triggers in this
      // transaction so the isolated test records can be removed before commit.
      await tx.$executeRawUnsafe('alter table public.fcd_ledger_entries disable trigger user')
      const conversions = await tx.fcd_conversions.findMany({ select: { id: true }, where: { created_by: actor } })
      if (conversions.length) await tx.fcd_conversion_lines.deleteMany({ where: { conversion_id: { in: conversions.map((item) => item.id) } } })
      await tx.fcd_status_logs.deleteMany({ where: { created_by: actor } })
      await tx.fcd_conversions.deleteMany({ where: { created_by: actor } })
      await tx.fcd_ledger_entries.deleteMany({ where: { created_by: actor } })
      await tx.bank_statement.deleteMany({ where: { created_by: actor } })
      await tx.accounts.deleteMany({ where: { id: { in: [sourceAccountId, destinationAccountId] } } })
      await tx.$executeRawUnsafe('alter table public.fcd_ledger_entries enable trigger user')
    })
  })

  it('allows one concurrent conversion only and never consumes FCD OD as native balance', async () => {
    const attempts = await Promise.allSettled(['one', 'two'].map((key) => prisma.$transaction((tx) => postFcdConversion(tx, {
      actor,
      actualThbReceived: 2625,
      bankFeeThb: 0,
      branchId,
      conversionDate: '2026-07-02',
      destinationAccountCode,
      idempotencyKey: `${actor}:${key}`,
      nativeAmount: 75,
      sourceAccountCode,
      sourceCurrencyCode: foreignCurrencyCode,
    }), { isolationLevel: 'Serializable' })))

    expect(attempts.filter((item) => item.status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter((item) => item.status === 'rejected')).toHaveLength(1)
    await expect(prisma.fcd_conversions.count({ where: { created_by: actor } })).resolves.toBe(1)
    const totals = await prisma.fcd_ledger_entries.aggregate({
      _sum: { native_amount_in: true, native_amount_out: true },
      where: { account_id: sourceAccountId, currency_code: foreignCurrencyCode },
    })
    expect(Number(totals._sum.native_amount_in ?? 0) - Number(totals._sum.native_amount_out ?? 0)).toBe(25)
  }, 30_000)
})
