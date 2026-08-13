import { buildPrintWeightRows, paginatePrintWeightRows, estimatePrintWeightRowHeight } from '../apps/next/src/lib/weight-ticket-print'
import type { WeightTicketRecord } from '../apps/next/src/lib/weight-tickets'

const lineCount = 20
const lines = Array.from({ length: lineCount }, (_, i) => ({
  containerDeductionWeight: '2', containerDeductionWeightValue: 2, deductionMode: 'none' as const,
  deductionValue: '0', deductionWeight: 0, grossWeight: '100', grossWeightValue: 100, id: `lot-${i + 1}`,
  imageCount: 0, imageNames: [], impurityId: '', impurityName: '', impuritySourceLineNo: null,
  lineNo: i + 1, netWeight: 98, note: '', parentLineNo: null, productId: 'product-a',
  productName: 'กระทะค้า, ผัด', warehouseId: '', warehouseName: '', warehouseType: '',
}))
const ticket: WeightTicketRecord = {
  branchId: 'branch-1', branchName: 'Main', canCancel: true, canEdit: true, cancelNote: '',
  cancelledAt: null, createdAt: '2026-07-19T00:00:00.000Z', createdBy: 'Tester',
  documentDate: '2026-07-19', documentNo: 'WTI190726-0001', downstreamAllocations: [],
  enteredBy: 'Tester', godownName: 'Main godown', id: 'ticket-1', imageCount: 0, imageNames: [],
  lines, partyId: 'supplier-1', partyName: 'Supplier', pendingOutEvents: [], pendingOutHistory: [],
  productSummaries: [{ billedWeight: 0, categoryName: 'โลหะ', containerDeductionWeight: 2, costSnapshotStatus: 'none', deductWeight: 0, grossWeight: 2000, hasMixedDeductionProfiles: false, id: 'summary-a', lineCount, netWeight: 1960, pendingOutQty: 0, pendingOutValue: 0, productId: 'product-a', productName: 'กระทะค้า, ผัด', remainingWeight: 1960, unitCostSnapshot: null }],
  remark: '', status: 'received', timeline: [], totals: { containerDeductionWeight: 40, deductionWeight: 0, grossWeight: 2000, netWeight: 1960 },
  type: 'WTI', updatedAt: null, updatedBy: '', usageTimeline: [], usedInPurchaseBillCount: 0,
  usedInPurchaseBillDocNos: [], usedInSalesBillCount: 0, usedInSalesBillDocNos: [],
  vehicleImageCount: 0, vehicleImageNames: [], vehicleNo: 'TEST-1',
}
const rows = buildPrintWeightRows(ticket, true)
console.log('row count:', rows.length)
console.log('per-row heights:', rows.map((r) => estimatePrintWeightRowHeight(r, true, true)))
const pages = paginatePrintWeightRows(rows, true)
console.log('pages:', pages.map((p) => p.items.length))
