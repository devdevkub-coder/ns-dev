import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const purchaseRouteSource = readFileSync(
  fileURLToPath(new URL('../../app/api/purchase/bills/route.ts', import.meta.url)),
  'utf8',
).replaceAll('\r\n', '\n')
const pageSource = readFileSync(
  fileURLToPath(new URL('./TransactionBillsPageClient.tsx', import.meta.url)),
  'utf8',
).replaceAll('\r\n', '\n')
const detailSource = readFileSync(
  fileURLToPath(new URL('../../lib/server/purchase-bill-detail.ts', import.meta.url)),
  'utf8',
).replaceAll('\r\n', '\n')

describe('purchase bill receipt weight display', () => {
  it('starts from WTI weight after container deduction and keeps impurity deduction separate', () => {
    expect(purchaseRouteSource).toContain('baseWeight: (toNumber(summary.gross_weight) - toNumber(summary.container_deduction_weight)) * remainingRatio')
    expect(purchaseRouteSource).toContain('deductWeight: toNumber(summary.deduct_weight) * remainingRatio')
    expect(pageSource).toContain('baseWeight: number')
    expect(pageSource).toContain('formatMoney(sourceSummary?.baseWeight ?? item.grossWeight)')
    expect(pageSource).toContain('formatMoney(sourceSummary?.deductWeight ?? item.deductWeight)')
  })

  it('uses the canonical allocation weight when reopening an existing PB for editing', () => {
    expect(pageSource).toContain('const nextForm = detail.editForm')
    expect(pageSource).toContain('setPurchaseFormExpectedUpdatedAt(detail.updatedAt)')
    expect(pageSource).toContain('function receiptSnapshotFromPurchaseForm(detail: PurchaseBillDetail, sourceForm: PurchaseBillFormValues)')
    expect(pageSource).toContain('detail.allocationRows.find((allocation) => allocation.lineNo === (item.lineNo ?? index + 1))?.productName')
    expect(pageSource).toContain('dailyFetchJson<PurchaseBillDetail>(`/api/purchase/bills/${encodeURIComponent(docNo)}`)')
  })

  it('uses only active receipt allocations in the purchase bill detail read model', () => {
    expect(detailSource).toContain("const allocationRows = bill.purchase_bill_items.map((item, index) => {\n    const receiptAllocation = item.purchase_bill_receipt_allocations?.allocation_status === 'active'")
    expect(detailSource).toContain("const poAllocation = item.purchase_bill_po_allocations?.allocation_status === 'active'")
    expect(detailSource).toContain("const poDocNo = poAllocation?.po_buys.doc_no ?? null")
    expect(detailSource).toContain("const poBuyId = poAllocation?.po_buys.doc_no ?? null")
    expect(detailSource).not.toContain('item.po_buys')
    expect(detailSource).not.toContain('sourceSnapshotStringArray')
    expect(detailSource).not.toContain("const poDocNo = poAllocation?.po_buys.doc_no\n      ?? item.po_buys?.doc_no")
    expect(detailSource).not.toContain("const poBuyId = poAllocation?.po_buys.doc_no ?? item.po_buys?.doc_no ?? null")
  })
})
