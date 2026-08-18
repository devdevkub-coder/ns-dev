import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const routeSource = readFileSync(new URL('./route.ts', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
const migrationSource = readFileSync(
  new URL('../../../../../../../supabase/migrations/20260730230000_harden_purchase_bill_write_guards.sql', import.meta.url),
  'utf8',
).replaceAll('\r\n', '\n')

describe('purchase bill write contract', () => {
  it('keeps create strict and scopes edit mismatch to the existing WTI links', () => {
    const postStart = routeSource.indexOf('export async function POST')
    const patchStart = routeSource.indexOf('export async function PATCH')
    const editValidationStart = routeSource.lastIndexOf('const existingReceiptTicketIds = await resolveReferencedReceiptTicketIdsFromBillItemsRead(existingBillItems)')
    const normalEditSupplierGuardStart = routeSource.indexOf('if (existingBill.supplier_id !== supplier.id)', patchStart)
    const supplierSwapPolicyStart = routeSource.indexOf(
      "{ mode: 'allow-linked-ticket-ids', ticketIds: new Set(originalReceiptTicketIds) }",
      patchStart,
    )

    expect(postStart).toBeGreaterThanOrEqual(0)
    expect(patchStart).toBeGreaterThan(postStart)
    expect(editValidationStart).toBeGreaterThan(patchStart)
    expect(normalEditSupplierGuardStart).toBeGreaterThan(patchStart)
    expect(normalEditSupplierGuardStart).toBeLessThan(editValidationStart)
    expect(supplierSwapPolicyStart).toBeGreaterThan(patchStart)
    expect(routeSource.slice(postStart, patchStart)).toContain("{ mode: 'required' }")
    expect(routeSource.slice(supplierSwapPolicyStart)).toContain("{ mode: 'allow-linked-ticket-ids', ticketIds: new Set(originalReceiptTicketIds) }")
    expect(routeSource.slice(editValidationStart)).toContain("{ mode: 'allow-linked-ticket-ids', ticketIds: existingReceiptTicketIdSet }")
    expect(routeSource.slice(normalEditSupplierGuardStart, editValidationStart)).toContain('validateSupplierChangeSourceItems(values, existingBillItems)')
    expect(routeSource).not.toContain('allowSupplierMismatchTicketIds: Set<bigint> = new Set()')
  })

  it('locks and revalidates sources inside the create transaction', () => {
    const postStart = routeSource.indexOf('export async function POST')
    const transactionStart = routeSource.indexOf('bill = await prisma.$transaction', postStart)
    const billInsert = routeSource.indexOf('const createdBill = await tx.purchase_bills.create', transactionStart)
    const transactionSource = routeSource.slice(transactionStart, billInsert)

    expect(postStart).toBeGreaterThanOrEqual(0)
    expect(transactionStart).toBeGreaterThan(postStart)
    expect(transactionSource).toContain('await lockPurchaseBillWriteSources(tx')
    expect(transactionSource).toContain('await validateStockReceiptSelection(\n              tx')
    expect(transactionSource).toContain('receiptSummarySourceMap = receiptValidation.receiptSummarySourceMap')
    expect(transactionSource).toContain('items = buildBillItems(values, productByRef, lockedPoBuyById, receiptSummarySourceMap)')
    expect(routeSource.slice(postStart, transactionStart)).not.toContain('await reconcilePoBuys(tx, poBuyIds)')
  })

  it('revalidates and rebuilds supplier-swap sources after locking', () => {
    const supplierSwapStart = routeSource.indexOf("if (raw?.action === 'supplier_swap')")
    const transactionStart = routeSource.indexOf('replacementBill = await prisma.$transaction', supplierSwapStart)
    const transactionSource = routeSource.slice(transactionStart, routeSource.indexOf('}, { timeout:', transactionStart))
    const lockStart = transactionSource.indexOf('await lockPurchaseBillWriteSources(tx')
    const lockedValidationStart = transactionSource.indexOf('const lockedReceiptValidation = await validateStockReceiptSelection(', lockStart)
    const rebuildStart = transactionSource.indexOf('items = buildBillItems(values, productByRef, lockedPoBuyById, receiptSummarySourceMap)', lockedValidationStart)
    const createItemsStart = transactionSource.indexOf('const itemRows = await createPurchaseBillItems(tx, createdBill.id, items)', rebuildStart)

    expect(supplierSwapStart).toBeGreaterThanOrEqual(0)
    expect(transactionStart).toBeGreaterThan(supplierSwapStart)
    expect(lockStart).toBeGreaterThanOrEqual(0)
    expect(lockedValidationStart).toBeGreaterThan(lockStart)
    expect(rebuildStart).toBeGreaterThan(lockedValidationStart)
    expect(createItemsStart).toBeGreaterThan(rebuildStart)
  })

  it('does not fabricate a unit when the source unit is missing', () => {
    expect(routeSource).not.toContain("unit: row.unit ?? 'กก.'")
    expect(routeSource).not.toContain("unit: product?.unit ?? 'กก.'")
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
