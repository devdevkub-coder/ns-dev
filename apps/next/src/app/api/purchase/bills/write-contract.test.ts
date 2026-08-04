import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const routeSource = readFileSync(new URL('./route.ts', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
const migrationSource = readFileSync(
  new URL('../../../../../../../supabase/migrations/20260730230000_harden_purchase_bill_write_guards.sql', import.meta.url),
  'utf8',
).replaceAll('\r\n', '\n')

describe('purchase bill write contract', () => {
  it('locks and revalidates sources inside the create transaction', () => {
    const postStart = routeSource.indexOf('export async function POST')
    const transactionStart = routeSource.indexOf('bill = await prisma.$transaction', postStart)
    const billInsert = routeSource.indexOf('const createdBill = await tx.purchase_bills.create', transactionStart)
    const transactionSource = routeSource.slice(transactionStart, billInsert)

    expect(postStart).toBeGreaterThanOrEqual(0)
    expect(transactionStart).toBeGreaterThan(postStart)
    expect(transactionSource).toContain('await lockPurchaseBillWriteSources(tx')
    expect(transactionSource).toContain('await validateStockReceiptSelection(\n              tx')
    expect(routeSource.slice(postStart, transactionStart)).not.toContain('await reconcilePoBuys(tx, poBuyIds)')
  })

  it('keeps report projection outside the source transaction', () => {
    const postStart = routeSource.indexOf('export async function POST')
    const responseStart = routeSource.indexOf('return NextResponse.json({ docNo: bill.doc_no, id: bill.doc_no })', postStart)
    const projectionStart = routeSource.indexOf('schedulePurchaseBillProfitCostProjection(bill.id)', postStart)

    expect(projectionStart).toBeGreaterThan(postStart)
    expect(projectionStart).toBeLessThan(responseStart)
    expect(routeSource.slice(postStart, responseStart)).not.toContain('projectProfitCostPurchaseBill(tx')
  })

  it('keeps every PB write within the approved ten-second transaction budget', () => {
    expect(routeSource).toContain('const PURCHASE_BILL_WRITE_TRANSACTION_TIMEOUT_MS = 10_000')
    expect(routeSource).not.toContain('timeout: 30000')
  })

  it('enforces WTI allocation capacity in the database', () => {
    expect(migrationSource).toContain('enforce_purchase_bill_receipt_allocation_capacity')
    expect(migrationSource).toContain('for update')
    expect(migrationSource).toContain('PURCHASE_BILL_RECEIPT_ALLOCATION_EXCEEDS_AVAILABLE_WEIGHT')
    expect(migrationSource).toContain('trg_enforce_purchase_bill_receipt_allocation_capacity')
  })
})
