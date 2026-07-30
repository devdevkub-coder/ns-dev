import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { cancelCustomerReceipt, createCustomerReceipt } from './customer-receipts'
import { prisma } from './prisma'

vi.mock('server-only', () => ({}))

const enabled = process.env.FCD_WRITE_INTEGRATION_TEST === '1'
const actor = `fcd-receipt-integration:${randomUUID()}@test.invalid`
const suffix = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()
let branchCode: string
let functionalCurrencyCode: string
let foreignCurrencyCode: string
let customerCode: string
let paymentMethodCode: string
let thbAccountCode: string
let fcdAccountCode: string
const billDocNos: Record<string, string> = {}

const context = { appUser: { email: actor }, authUser: { email: actor } }

type CustomerReceiptValues = Parameters<typeof createCustomerReceipt>[0]

function values(overrides: Partial<CustomerReceiptValues>): CustomerReceiptValues {
  return {
    accountId: thbAccountCode,
    amount: 0,
    billId: null,
    branchId: branchCode,
    customerAdvanceLines: [],
    customerId: customerCode,
    customerTransferredNativeAmount: undefined,
    date: '2026-07-30',
    discount: 0,
    fee: 0,
    fxRate: undefined,
    fxRateOverrideReason: null,
    fxRateType: undefined,
    id: null,
    method: paymentMethodCode,
    notes: null,
    receiptCurrencyCode: functionalCurrencyCode,
    receivedNativeAmount: undefined,
    salesBillLines: [],
    sourceType: 'SB',
    splits: [],
    withholdingTax: 0,
    ...overrides,
  } as CustomerReceiptValues
}

describe.runIf(enabled)('customer receipt foreign integration', () => {
  beforeAll(async () => {
    const [policies, branch, category, method] = await Promise.all([
      prisma.finance_currency_policies.findMany({ select: { functional_currency_code: true }, take: 2 }),
      prisma.branches.findFirst({ select: { code: true, id: true }, where: { active: true } }),
      prisma.account_categories.findFirst({ select: { code: true }, where: { account_group: 'bank', active: true } }),
      prisma.payment_methods.findFirst({ select: { type: true }, where: { active: true } }),
    ])
    if (policies.length !== 1 || !branch || !category || !method) throw new Error('receipt integration fixture ไม่มี master ที่ใช้งานได้ครบ')
    const foreignCurrency = await prisma.currencies.findFirst({ orderBy: { code: 'asc' }, select: { code: true }, where: { code: { not: policies[0]!.functional_currency_code } } })
    if (!foreignCurrency) throw new Error('receipt integration fixture ไม่มีสกุลเงินต่างประเทศ')
    branchCode = branch.code
    functionalCurrencyCode = policies[0]!.functional_currency_code
    foreignCurrencyCode = foreignCurrency.code
    customerCode = `CUSI${suffix}`
    paymentMethodCode = `PMI${suffix}`
    thbAccountCode = `BNKI${suffix}`
    fcdAccountCode = `FCDI${suffix}`
    for (const key of Object.keys({ thb: 100, partial: 3500, multiOne: 875, multiTwo: 875, fxGain: 3400 })) billDocNos[key] = `SBI${key.toUpperCase()}${suffix}`

    await prisma.$transaction(async (tx) => {
      const customer = await tx.customers.create({ data: { active: true, code: customerCode, name: `Receipt integration ${suffix}`, updated_by: actor } })
      await tx.payment_methods.create({ data: { active: true, code: paymentMethodCode, name: `Receipt method ${suffix}`, type: method.type } })
      const [thbAccount, fcdAccount] = await Promise.all([
        tx.accounts.create({ data: { account_group: category.code, account_no: `THB-${suffix}`, active: true, bank_account_type: 'savings', bank_name: 'Fixture Bank', code: thbAccountCode, currency: functionalCurrencyCode, is_fcd: false, name: `THB receipt ${suffix}`, od_limit: 0, opening_balance: 0, type: 'bank', updated_by: actor } }),
        tx.accounts.create({ data: { account_group: category.code, account_no: `FCD-${suffix}`, active: true, bank_account_type: 'current', bank_name: 'Fixture Bank', code: fcdAccountCode, currency: foreignCurrencyCode, is_fcd: true, name: `FCD receipt ${suffix}`, od_limit: 0, opening_balance: 0, type: 'bank', updated_by: actor } }),
      ])
      await tx.account_currency_balances.createMany({ data: [
        { account_id: thbAccount.id, currency_code: functionalCurrencyCode },
        { account_id: fcdAccount.id, currency_code: functionalCurrencyCode },
        { account_id: fcdAccount.id, currency_code: foreignCurrencyCode },
      ] })
      await tx.sales_bills.createMany({ data: Object.entries({ thb: 100, partial: 3500, multiOne: 875, multiTwo: 875, fxGain: 3400 }).map(([key, total]) => ({ branch_id: branch.id, customer_id: customer.id, date: new Date('2026-07-30'), doc_no: billDocNos[key]!, receivable_balance: total, received_amount: 0, status: 'open', total_amount: total, updated_by: actor })) })
    })
  })

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      const receiptIds = (await tx.customer_receipts.findMany({ select: { id: true }, where: { created_by: actor } })).map((row) => row.id)
      const conversionIds = (await tx.fcd_conversions.findMany({ select: { id: true }, where: { created_by: actor } })).map((row) => row.id)
      await tx.customer_receipt_account_splits.deleteMany({ where: { receipt_id: { in: receiptIds } } })
      await tx.customer_receipt_allocations.deleteMany({ where: { receipt_id: { in: receiptIds } } })
      await tx.customer_receipt_status_logs.deleteMany({ where: { created_by: actor } })
      await tx.sales_bill_status_logs.deleteMany({ where: { created_by: actor } })
      await tx.receipts.deleteMany({ where: { created_by: actor } })
      await tx.customer_receipts.deleteMany({ where: { created_by: actor } })
      await tx.fcd_conversion_lines.deleteMany({ where: { conversion_id: { in: conversionIds } } })
      await tx.$executeRawUnsafe('alter table public.fcd_ledger_entries disable trigger user')
      await tx.fcd_ledger_entries.deleteMany({ where: { created_by: actor } })
      await tx.$executeRawUnsafe('alter table public.fcd_ledger_entries enable trigger user')
      await tx.bank_statement.deleteMany({ where: { created_by: actor } })
      await tx.sales_bills.deleteMany({ where: { updated_by: actor } })
      await tx.payment_methods.deleteMany({ where: { code: paymentMethodCode } })
      await tx.customers.deleteMany({ where: { code: customerCode } })
      await tx.accounts.deleteMany({ where: { code: { in: [thbAccountCode, fcdAccountCode] } } })
    })
  })

  it('posts and cancels an existing THB receipt through the same service', async () => {
    const created = await createCustomerReceipt(values({ amount: 100, docNo: `RCPT${suffix}`, salesBillLines: [{ discountAmount: 0, id: null, receiptAmount: 100, salesBillDocNo: billDocNos.thb!, withholdingTaxAmount: 0 }], splits: [{ accountId: thbAccountCode, amount: 100, id: null, method: paymentMethodCode }] }), context)
    await cancelCustomerReceipt(created.id, 'integration cancellation', context)
    const [receipt, bill, statements] = await Promise.all([
      prisma.customer_receipts.findUnique({ where: { doc_no: created.id } }),
      prisma.sales_bills.findUnique({ where: { doc_no: billDocNos.thb! } }),
      prisma.bank_statement.findMany({ where: { created_by: actor, ref_no: created.id } }),
    ])
    expect(receipt?.status).toBe('cancelled')
    expect(Number(bill?.receivable_balance)).toBe(100)
    expect(statements).toHaveLength(2)
  }, 60_000)

  it('posts USD partial and multiple-bill receipt, applies THB bank fee, and records settlement FX separately', async () => {
    const partialAndMulti = await createCustomerReceipt(values({ accountId: fcdAccountCode, amount: 3500, customerTransferredNativeAmount: 100, docNo: `RCPF${suffix}`, fee: 35, fxRate: 35, fxRateOverrideReason: 'integration fixture', fxRateType: 'integration', receiptCurrencyCode: foreignCurrencyCode, receivedNativeAmount: 99, salesBillLines: [
      { discountAmount: 0, id: null, receiptAmount: 1750, salesBillDocNo: billDocNos.partial!, withholdingTaxAmount: 0 },
      { discountAmount: 0, id: null, receiptAmount: 875, salesBillDocNo: billDocNos.multiOne!, withholdingTaxAmount: 0 },
      { discountAmount: 0, id: null, receiptAmount: 875, salesBillDocNo: billDocNos.multiTwo!, withholdingTaxAmount: 0 },
    ], splits: [{ accountId: fcdAccountCode, amount: 99, id: null, method: paymentMethodCode }] }), context)
    const fxGain = await createCustomerReceipt(values({ accountId: fcdAccountCode, amount: 3400, customerTransferredNativeAmount: 100, docNo: `RCPG${suffix}`, fxRate: 35, fxRateOverrideReason: 'integration fixture', fxRateType: 'integration', receiptCurrencyCode: foreignCurrencyCode, receivedNativeAmount: 100, salesBillLines: [{ discountAmount: 0, id: null, receiptAmount: 3400, salesBillDocNo: billDocNos.fxGain!, withholdingTaxAmount: 0 }], splits: [{ accountId: fcdAccountCode, amount: 100, id: null, method: paymentMethodCode }] }), context)
    const [receipt, gainReceipt, partialBill, multiBills, splits] = await Promise.all([
      prisma.customer_receipts.findUnique({ where: { doc_no: partialAndMulti.id } }),
      prisma.customer_receipts.findUnique({ where: { doc_no: fxGain.id } }),
      prisma.sales_bills.findUnique({ where: { doc_no: billDocNos.partial! } }),
      prisma.sales_bills.findMany({ where: { doc_no: { in: [billDocNos.multiOne!, billDocNos.multiTwo!] } } }),
      prisma.customer_receipt_account_splits.findMany({ where: { receipt_id: { in: (await prisma.customer_receipts.findMany({ select: { id: true }, where: { doc_no: { in: [partialAndMulti.id, fxGain.id] } } })).map((row) => row.id) } } }),
    ])
    expect(Number(receipt?.bank_fee_total)).toBe(35)
    expect(Number(receipt?.customer_transferred_native_amount)).toBe(100)
    expect(Number(receipt?.received_native_amount)).toBe(99)
    expect(Number(receipt?.carrying_thb_amount)).toBe(3465)
    expect(Number(partialBill?.receivable_balance)).toBe(1750)
    expect(multiBills.every((bill) => Number(bill.receivable_balance) === 0)).toBe(true)
    expect(Number(gainReceipt?.settlement_fx_difference)).toBe(100)
    expect(gainReceipt?.settlement_difference_reason).toBe('fx_settlement')
    expect(splits).toHaveLength(2)
    await cancelCustomerReceipt(partialAndMulti.id, 'integration foreign cancellation', context)
    const [cancelledReceipt, restoredPartial, restoredMultiBills, ledgerTotals] = await Promise.all([
      prisma.customer_receipts.findUnique({ where: { doc_no: partialAndMulti.id } }),
      prisma.sales_bills.findUnique({ where: { doc_no: billDocNos.partial! } }),
      prisma.sales_bills.findMany({ where: { doc_no: { in: [billDocNos.multiOne!, billDocNos.multiTwo!] } } }),
      prisma.fcd_ledger_entries.aggregate({ _sum: { native_amount_in: true, native_amount_out: true }, where: { created_by: actor, currency_code: foreignCurrencyCode } }),
    ])
    expect(cancelledReceipt?.status).toBe('cancelled')
    expect(Number(restoredPartial?.receivable_balance)).toBe(3500)
    expect(restoredMultiBills.every((bill) => Number(bill.receivable_balance) === 875)).toBe(true)
    expect(Number(ledgerTotals._sum.native_amount_in ?? 0) - Number(ledgerTotals._sum.native_amount_out ?? 0)).toBe(100)
  }, 60_000)
})
