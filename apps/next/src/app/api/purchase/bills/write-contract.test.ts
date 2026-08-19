import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const routeSource = readFileSync(new URL('./route.ts', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
const detailSource = readFileSync(new URL('../../../../lib/server/purchase-bill-detail.ts', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
const purchaseBillSource = readFileSync(new URL('../../../../lib/purchase-bill.ts', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
const transactionBillsClientSource = readFileSync(
  new URL('../../../../components/daily/TransactionBillsPageClient.tsx', import.meta.url),
  'utf8',
).replaceAll('\r\n', '\n')
const migrationSource = readFileSync(
  new URL('../../../../../../../supabase/migrations/20260730230000_harden_purchase_bill_write_guards.sql', import.meta.url),
  'utf8',
).replaceAll('\r\n', '\n')

describe('purchase bill write contract', () => {
  it('keeps create strict and scopes edit mismatch to the existing WTI links', () => {
    const postStart = routeSource.indexOf('export async function POST')
    const patchStart = routeSource.indexOf('export async function PATCH')
    const editValidationStart = routeSource.lastIndexOf('const existingReceiptTicketIds = await resolveActiveReceiptTicketIdsForBill(prisma, existingBillRef.id)')
    const normalEditSupplierGuardStart = routeSource.indexOf('const supplierChanged = existingBill.supplier_id !== supplier.id', patchStart)
    const patchSource = routeSource.slice(patchStart)

    expect(postStart).toBeGreaterThanOrEqual(0)
    expect(patchStart).toBeGreaterThan(postStart)
    expect(editValidationStart).toBeGreaterThan(patchStart)
    expect(normalEditSupplierGuardStart).toBeGreaterThan(patchStart)
    expect(routeSource.slice(postStart, patchStart)).toContain("{ mode: 'required' }")
    expect(patchSource).toContain("{ mode: 'allow-linked-ticket-ids', ticketIds: existingReceiptTicketIdSet }")
    expect(routeSource.slice(normalEditSupplierGuardStart, editValidationStart)).toContain('const sourceFacts = await loadPurchaseBillSupplierChangeSourceFacts(prisma, existingBillRef.id, values.transactionMode)')
    expect(routeSource.slice(normalEditSupplierGuardStart, editValidationStart)).toContain('validateSupplierChangeSourceItems(values, sourceFacts.facts)')
    expect(routeSource).toContain('const lockedSourceFacts = await loadPurchaseBillSupplierChangeSourceFacts(tx, existingBillRef.id, values.transactionMode)')
    expect(routeSource).toContain('const existingReceiptTicketIds = await resolveActiveReceiptTicketIdsForBill(tx, existingBillRef.id)')
    expect(routeSource).not.toContain('resolveReferencedReceiptTicketIdsFromBillItems')
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

  it('changes Supplier on the existing PB instead of creating a replacement bill', () => {
    const patchStart = routeSource.indexOf('export async function PATCH')
    const patchSource = routeSource.slice(patchStart)

    expect(patchSource).not.toContain("raw?.action === 'supplier_swap'")
    expect(patchSource).not.toContain('replacementBill')
    expect(patchSource).not.toContain('replacedDocNo')
    expect(patchSource).not.toContain('nextPurchaseBillDocNo(')
    expect(patchSource).toContain('const updatedBill = await prisma.$transaction')
    expect(patchSource).toContain('const bill = await tx.purchase_bills.update')
    expect(patchSource).toContain('where: { id: existingBillRef.id }')
    expect(patchSource).toContain('id: updatedBill.doc_no')
    expect(patchSource).toContain('...(lockedSupplierChanged ? supplierSnapshotFields(supplier) : {}),')
    expect(patchSource).toContain('await tx.bill_swap_history.createMany')
    expect(patchSource).toContain('PURCHASE_BILL_STATUS_ACTION.SUPPLIER_CHANGED')
    expect(routeSource).toContain('function validateSupplierChangeRequest')
    expect(routeSource).toContain("values.purchaseSource !== 'SPOT_BUY'")
    expect(patchSource).toContain('validateSupplierChangeRequest(values)')
    expect(patchSource).toContain('releasedPoAllocation')
    expect(patchSource).toContain('const lockedExistingBill = await tx.purchase_bills.findUnique')
    expect(patchSource).toContain('const lockedExistingBillItems = await tx.purchase_bill_items.findMany')
    expect(patchSource).toContain('const { expectedUpdatedAt } = purchaseBillEditConcurrencySchema.parse(raw)')
    expect(patchSource).toContain('lockedExistingBill.branch_id !== effectiveBranch.id')
    expect(patchSource).toContain('lockedExistingBill.warehouse_id !== purchaseWarehouseId')
    expect(patchSource).toContain('const editReason = lockedSupplierChanged ?')
  })

  it('does not fabricate a unit when the source unit is missing', () => {
    expect(routeSource).not.toContain("unit: row.unit ?? 'กก.'")
    expect(routeSource).not.toContain("unit: product?.unit ?? 'กก.'")
  })

  it('derives receipt ticket document numbers from the validated WTI', () => {
    const buildItemsStart = routeSource.indexOf('function buildBillItems(')
    const buildItemsEnd = routeSource.indexOf('\nasync function createPurchaseBillItems', buildItemsStart)
    const buildItemsSource = routeSource.slice(buildItemsStart, buildItemsEnd)

    expect(routeSource).toContain('if (item.receiptTicketId !== ticket.doc_no || !resolvedSummaryRef)')
    expect(buildItemsSource).toContain('const lineNos = resolvePurchaseBillItemLineNos(values.items)')
    expect(buildItemsSource).toContain('lineNo: lineNos[index]')
    expect(buildItemsSource).not.toContain('receiptTicketDocNo')
    expect(buildItemsSource).not.toContain('receiptTicketId: item.receiptTicketId')
    expect(routeSource).toContain('line_no: item.lineNo')
    expect(purchaseBillSource).toContain("lineNoIndexes.set(item.lineNo, index)")
    expect(routeSource).toContain('receiptTicketDocNoByItemId')
    expect(routeSource).not.toContain("typeof snapshot.receiptTicketDocNo === 'string' ? snapshot.receiptTicketDocNo : null")
    expect(detailSource).toContain('const receiptTicketDocNo = receiptTicketId')
    expect(detailSource).not.toContain("sourceSnapshotValue(item.source_snapshot, 'receiptTicketDocNo')")
    expect(detailSource).not.toContain("sourceSnapshotValue(snapshot, 'receiptTicketId')")
    expect(detailSource).not.toContain("sourceSnapshotValue(snapshot, 'receiptLineId')")
    expect(detailSource).not.toContain("sourceSnapshotValue(snapshot, 'receiptSummaryId')")
    expect(detailSource).not.toContain("sourceSnapshotStringArray(snapshot, 'receiptLineIds')")
  })

  it('keeps new split rows on a new line identity and matches supplier history by line number', () => {
    expect(transactionBillsClientSource).toContain('lineNo: undefined')
    expect(transactionBillsClientSource).toContain('lineNo: item.lineNo ?? index + 1')
    expect(routeSource).toContain('const beforeItemsByLineNo = new Map(lockedExistingBillItems.map((item) => [item.line_no, item] as const))')
    expect(routeSource).toContain('const afterItemsByLineNo = new Map(itemRows.map((item) => [item.line_no, item] as const))')
    expect(routeSource).toContain('item_index: lineNo - 1')
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
