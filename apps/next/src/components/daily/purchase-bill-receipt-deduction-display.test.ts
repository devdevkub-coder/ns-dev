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
    expect(pageSource).toContain('detail.allocationRows.find((allocation) => allocation.lineNo === index + 1)?.productName')
    expect(pageSource).toContain('dailyFetchJson<PurchaseBillDetail>(`/api/purchase/bills/${encodeURIComponent(docNo)}`)')
  })
})
