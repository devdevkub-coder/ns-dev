import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { postFcdConversion, reverseFcdConversion } from './fcd-conversion-posting'
import { postFcdReceiptAccountSplits, reverseFcdReceiptAccountSplits } from './fcd-receipt-posting'
import { postFcdRevaluation, reverseFcdRevaluation } from './fcd-revaluation-posting'
import { prisma } from './prisma'

const enabled = process.env.FCD_WRITE_INTEGRATION_TEST === '1'
const actor = `fcd-lifecycle-test:${randomUUID()}`
let branchId: bigint
let functionalCurrencyCode: string
let foreignCurrencyCode: string
let fcdAccountCode: string
let thbAccountCode: string
let receiptId: bigint
let receiptDocNo: string
let salesBillId: bigint
let customerId: bigint
let paymentMethodId: bigint
let fcdAccountId: bigint
let thbAccountId: bigint

describe.runIf(enabled)('FCD receipt lifecycle reconciliation integration', () => {
  beforeAll(async () => {
    const [policies, branch, category, customer, paymentMethod] = await Promise.all([
      prisma.finance_currency_policies.findMany({ select: { functional_currency_code: true }, take: 2 }),
      prisma.branches.findFirst({ select: { id: true }, where: { active: true } }),
      prisma.account_categories.findFirst({ select: { code: true }, where: { account_group: 'bank', active: true } }),
      prisma.customers.findFirst({ select: { id: true, code: true, name: true }, where: { active: true } }),
      prisma.payment_methods.findFirst({ select: { id: true, code: true, name: true, type: true }, where: { active: true } }),
    ])
    if (policies.length !== 1 || !branch || !category || !customer || !paymentMethod) throw new Error('FCD lifecycle fixture ไม่มี master ที่ใช้งานได้ครบ')
    const currency = await prisma.currencies.findFirst({ orderBy: { code: 'asc' }, select: { code: true }, where: { code: { not: policies[0]!.functional_currency_code } } })
    if (!currency) throw new Error('FCD lifecycle fixture ไม่มีสกุลเงินต่างประเทศ')
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()
    branchId = branch.id
    functionalCurrencyCode = policies[0]!.functional_currency_code
    foreignCurrencyCode = currency.code
    fcdAccountCode = `FCDL${suffix}`
    thbAccountCode = `BNKL${suffix}`
    receiptDocNo = `RCPL${suffix}`

    await prisma.$transaction(async (tx) => {
      const [fcdAccount, thbAccount, fixtureCustomer, fixtureMethod] = await Promise.all([
        tx.accounts.create({ data: { account_group: category.code, account_no: `FCD-${suffix}`, active: true, bank_account_type: 'current', bank_name: 'FCD lifecycle bank', code: fcdAccountCode, currency: foreignCurrencyCode, is_fcd: true, name: `FCD lifecycle ${suffix}`, od_limit: 0, opening_balance: 0, type: 'bank', updated_by: actor } }),
        tx.accounts.create({ data: { account_group: category.code, account_no: `THB-${suffix}`, active: true, bank_account_type: 'savings', bank_name: 'THB lifecycle bank', code: thbAccountCode, currency: functionalCurrencyCode, is_fcd: false, name: `THB lifecycle ${suffix}`, od_limit: 0, opening_balance: 0, type: 'bank', updated_by: actor } }),
        tx.customers.create({ data: { active: true, code: `CUSL${suffix}`, name: `FCD lifecycle customer ${suffix}`, updated_by: actor } }),
        tx.payment_methods.create({ data: { active: true, code: `PML${suffix}`, name: `FCD lifecycle method ${suffix}`, type: paymentMethod.type } }),
      ])
      fcdAccountId = fcdAccount.id
      thbAccountId = thbAccount.id
      customerId = fixtureCustomer.id
      paymentMethodId = fixtureMethod.id
      await tx.account_currency_balances.createMany({ data: [
        { account_id: fcdAccount.id, currency_code: foreignCurrencyCode },
        { account_id: fcdAccount.id, currency_code: functionalCurrencyCode },
        { account_id: thbAccount.id, currency_code: functionalCurrencyCode },
      ] })
      const bill = await tx.sales_bills.create({ data: { branch_id: branch.id, customer_id: fixtureCustomer.id, date: new Date('2026-07-01'), doc_no: `SBL${suffix}`, receivable_balance: 3500, received_amount: 0, status: 'open', total_amount: 3500, updated_by: actor } })
      salesBillId = bill.id
      const receipt = await tx.customer_receipts.create({ data: {
        account_code_snapshot: fcdAccount.code, account_id: fcdAccount.id, account_name_snapshot: fcdAccount.name, bank_fee_total: 0, branch_id: branch.id, carrying_thb_amount: 3500, created_by: actor, customer_code_snapshot: fixtureCustomer.code, customer_id: fixtureCustomer.id, customer_name_snapshot: fixtureCustomer.name, customer_transferred_native_amount: 100, date: new Date('2026-07-01'), discount_total: 0, doc_no: receiptDocNo, fx_rate: 35, fx_rate_date: new Date('2026-07-01'), fx_rate_overridden: true, fx_rate_override_reason: 'integration fixture', fx_rate_type: 'integration', gross_amount: 3500, net_cash_in: 3500, payment_method_code_snapshot: fixtureMethod.code, payment_method_id: fixtureMethod.id, payment_method_name_snapshot: fixtureMethod.name, receipt_currency_code: foreignCurrencyCode, received_native_amount: 100, settlement_book_amount: 3500, settlement_fx_difference: 0, source_type: 'SB', status: 'active', updated_by: actor, withholding_tax_total: 0,
      } })
      receiptId = receipt.id
      await postFcdReceiptAccountSplits(tx, { actor, bankStatementDocNos: [`BSL${suffix}`], branchId: branch.id, currencyCode: foreignCurrencyCode, date: '2026-07-01', rate: 35, receiptDocNo, receiptId: receipt.id, sourceEventKey: `${actor}:receipt`, splits: [{ accountCode: fcdAccount.code, nativeAmount: 100 }] })
      await tx.customer_receipt_allocations.create({ data: { allocated_ar_amount: 3500, created_by: actor, customer_code_snapshot: fixtureCustomer.code, discount_amount: 0, line_no: 1, native_amount_allocated: 100, outstanding_after: 0, outstanding_before: 3500, receipt_amount: 3500, receipt_id: receipt.id, sales_bill_doc_no_snapshot: bill.doc_no, sales_bill_id: bill.id, settlement_book_amount: 3500, settlement_fx_difference: 0, status: 'active', updated_by: actor, withholding_tax_amount: 0 } })
    })
  })

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      const conversionIds = (await tx.fcd_conversions.findMany({ select: { id: true }, where: { created_by: actor } })).map((row) => row.id)
      const revaluationIds = (await tx.fcd_revaluation_batches.findMany({ select: { id: true }, where: { created_by: actor } })).map((row) => row.id)
      await tx.customer_receipt_account_splits.deleteMany({ where: { receipt_id: receiptId } })
      await tx.customer_receipt_allocations.deleteMany({ where: { receipt_id: receiptId } })
      await tx.fcd_conversion_lines.deleteMany({ where: { conversion_id: { in: conversionIds } } })
      await tx.fcd_revaluation_lines.deleteMany({ where: { batch_id: { in: revaluationIds } } })
      await tx.fcd_status_logs.deleteMany({ where: { created_by: actor } })
      await tx.fcd_conversions.deleteMany({ where: { created_by: actor } })
      await tx.fcd_revaluation_batches.deleteMany({ where: { created_by: actor } })
      await tx.customer_receipts.deleteMany({ where: { id: receiptId } })
      await tx.$executeRawUnsafe('alter table public.fcd_ledger_entries disable trigger user')
      await tx.fcd_ledger_entries.deleteMany({ where: { created_by: actor } })
      await tx.$executeRawUnsafe('alter table public.fcd_ledger_entries enable trigger user')
      await tx.bank_statement.deleteMany({ where: { created_by: actor } })
      await tx.sales_bills.deleteMany({ where: { id: salesBillId } })
      await tx.payment_methods.deleteMany({ where: { id: paymentMethodId } })
      await tx.customers.deleteMany({ where: { id: customerId } })
      await tx.accounts.deleteMany({ where: { id: { in: [fcdAccountId, thbAccountId] } } })
    })
  })

  it('reconciles receipt, revaluation, conversion, and reversals without changing final balance', async () => {
    const revaluation = await prisma.$transaction((tx) => postFcdRevaluation(tx, { accountCode: fcdAccountCode, actor, branchId, closingFxRate: 36, currencyCode: foreignCurrencyCode, idempotencyKey: `${actor}:revaluation`, periodEnd: '2026-07-31', rateOverrideReason: 'integration fixture', rateType: 'integration' }))
    expect(revaluation.unrealizedFxDifference.toFixed(2)).toBe('100.00')
    const conversion = await prisma.$transaction((tx) => postFcdConversion(tx, { actor, actualThbReceived: 1850, bankFeeThb: 0, branchId, conversionDate: '2026-08-01', destinationAccountCode: thbAccountCode, idempotencyKey: `${actor}:conversion`, nativeAmount: 50, sourceAccountCode: fcdAccountCode, sourceCurrencyCode: foreignCurrencyCode }))
    expect(conversion.realizedFxDifference.toFixed(2)).toBe('50.00')
    await prisma.$transaction((tx) => reverseFcdConversion(tx, { actor, conversionDate: '2026-08-02', idempotencyKey: `${actor}:conversion-reversal`, originalDocNo: conversion.docNo }))
    await prisma.$transaction((tx) => reverseFcdRevaluation(tx, { actor, idempotencyKey: `${actor}:revaluation-reversal`, originalDocNo: revaluation.docNo, reversalDate: '2026-08-02' }))
    await prisma.$transaction((tx) => reverseFcdReceiptAccountSplits(tx, { actor, bankStatementDocNos: [`BSLR${receiptDocNo.slice(-12)}`], branchId, date: '2026-08-02', receiptDocNo, receiptId, sourceEventKey: `${actor}:receipt-reversal` }))
    const totals = await prisma.fcd_ledger_entries.aggregate({ _sum: { carrying_thb_in: true, carrying_thb_out: true, native_amount_in: true, native_amount_out: true }, where: { account_id: fcdAccountId, currency_code: foreignCurrencyCode } })
    expect(Number(totals._sum.native_amount_in ?? 0) - Number(totals._sum.native_amount_out ?? 0)).toBe(0)
    expect(Number(totals._sum.carrying_thb_in ?? 0) - Number(totals._sum.carrying_thb_out ?? 0)).toBe(0)
  }, 30_000)
})
