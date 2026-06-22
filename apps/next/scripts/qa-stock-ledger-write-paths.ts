import {
  createProductionInput,
  createProductionOrder,
  createProductionOutput,
  productionOrderOptions,
  reverseProductionInput,
  reverseProductionOutput,
} from '../src/lib/server/production-orders'
import { appendStockIssueStatusLog, STOCK_ISSUE_STATUS_ACTION } from '../src/lib/server/stock-issue-history'
import { consumeActiveWtoStockHoldsForPendingSale, reversePendingSaleStockIssue } from '../src/lib/server/stock-holds'
import { appendWeightTicketStatusLog, WEIGHT_TICKET_STATUS_ACTION } from '../src/lib/server/weight-ticket-status-history'
import { nextDailyDocNo, normalizeDate, toNumber } from '../src/lib/server/daily'
import { prisma } from '../src/lib/server/prisma'
import { buildProductionReconciliationReport } from '../src/lib/server/production-reconciliation'
import type { Prisma } from '../generated/prisma/client'

const actor = 'codex-qa'
const qaDate = process.env.QA_DATE ?? '2026-06-12'

type QaResult = {
  docNo: string
  kind: string
  refs: string[]
}

type ProductionQaScenario = {
  branch_code: string
  destination_warehouse_code: string
  product_code: string
  source_status: 'RM' | 'FG'
  source_warehouse_code: string
  wip_warehouse_code: string
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function assertNoReconciliationIssues() {
  const productionReport = await buildProductionReconciliationReport()
  assert(!productionReport.summary.hasIssues, `production reconciliation still has ${productionReport.summary.issueCount} issue(s)`)
}

async function qaPendingSaleCancel(): Promise<QaResult> {
  const result = await prisma.$transaction(async (tx) => {
    const ticket = await tx.weight_tickets.findFirst({
      include: {
        customers: { select: { code: true, name: true } },
        stock_holds: {
          include: {
            products: { select: { code: true, name: true } },
            warehouses: { select: { code: true, id: true, name: true } },
          },
          orderBy: [{ source_line_no: 'asc' }, { id: 'asc' }],
          where: { status: 'active' },
        },
      },
      orderBy: [{ document_date: 'desc' }, { doc_no: 'desc' }],
      where: {
        cancelled_at: null,
        doc_type: 'WTO',
        status: 'delivered',
        stock_holds: { some: { status: 'active' } },
      },
    })
    assert(ticket, 'ไม่พบ WTO ที่มี active hold สำหรับ QA PSALE')
    assert(ticket.customer_id, `WTO ${ticket.doc_no} ไม่มี customer_id`)

    const docNo = await nextDailyDocNo('stock_issues', 'PSALE', qaDate, tx)
    const consumedLines = await consumeActiveWtoStockHoldsForPendingSale(tx, {
      actor,
      branchId: ticket.branch_id,
      issueDate: normalizeDate(qaDate),
      stockIssueDocNo: docNo,
      weightTicketId: ticket.id,
    })
    const productById = new Map(ticket.stock_holds.map((hold) => [hold.product_id, hold.products]))
    const warehouseById = new Map(ticket.stock_holds.map((hold) => [hold.warehouse_id, hold.warehouses]))
    const items = consumedLines.map((line, index) => {
      const product = productById.get(line.productId)
      const warehouse = warehouseById.get(line.warehouseId)
      assert(product?.code, `WTO ${ticket.doc_no} hold line ${line.sourceLineNo} ไม่มี product code`)
      assert(warehouse?.code, `WTO ${ticket.doc_no} hold line ${line.sourceLineNo} ไม่มี warehouse code`)
      return {
        amount: line.qty * 1,
        costAmount: line.valueOut,
        deliveryTicketDocNo: ticket.doc_no,
        deliveryTicketId: ticket.doc_no,
        lineNo: index + 1,
        price: 1,
        productCode: product.code,
        productId: product.code,
        productName: product.name,
        qty: line.qty,
        sourceLineNo: line.sourceLineNo,
        unitCost: line.unitCost,
        warehouseCode: warehouse.code,
        warehouseId: warehouse.code,
        warehouseName: warehouse.name,
      }
    })
    const totalCost = items.reduce((sum, item) => sum + item.costAmount, 0)
    const totalEstAmount = items.reduce((sum, item) => sum + item.amount, 0)
    const firstWarehouseId = consumedLines[0]?.warehouseId ?? null
    const stockIssue = await tx.stock_issues.create({
      data: {
        branch_id: ticket.branch_id,
        created_by: actor,
        customer_id: ticket.customer_id,
        date: normalizeDate(qaDate),
        doc_no: docNo,
        items: items as Prisma.InputJsonValue,
        notes: 'QA PSALE cancel/reversal',
        status: 'pending',
        total_cost: totalCost,
        total_est_amount: totalEstAmount,
        warehouse_id: firstWarehouseId,
      },
      select: { doc_no: true, id: true },
    })
    await appendStockIssueStatusLog(tx, {
      action: STOCK_ISSUE_STATUS_ACTION.CREATED,
      actor,
      meta: { deliveryTicketDocNo: ticket.doc_no, reason: 'qa_pending_sale_create' },
      note: 'QA PSALE cancel/reversal',
      stockIssueId: stockIssue.id,
      toStatus: 'pending',
    })
    await tx.weight_tickets.update({
      data: { status: 'partially_billed', updated_at: new Date(), updated_by: actor },
      where: { id: ticket.id },
    })

    await reversePendingSaleStockIssue(tx, {
      actor,
      cancelDate: normalizeDate(qaDate),
      note: 'QA edit pending sale',
      stockIssueDocNo: stockIssue.doc_no,
    })
    const editedLines = await consumeActiveWtoStockHoldsForPendingSale(tx, {
      actor,
      branchId: ticket.branch_id,
      issueDate: normalizeDate(qaDate),
      stockIssueDocNo: stockIssue.doc_no,
      weightTicketId: ticket.id,
    })
    const editedItems = editedLines.map((line, index) => {
      const product = productById.get(line.productId)
      const warehouse = warehouseById.get(line.warehouseId)
      assert(product?.code, `WTO ${ticket.doc_no} edited hold line ${line.sourceLineNo} ไม่มี product code`)
      assert(warehouse?.code, `WTO ${ticket.doc_no} edited hold line ${line.sourceLineNo} ไม่มี warehouse code`)
      return {
        amount: line.qty * 2,
        costAmount: line.valueOut,
        deliveryTicketDocNo: ticket.doc_no,
        deliveryTicketId: ticket.doc_no,
        lineNo: index + 1,
        price: 2,
        productCode: product.code,
        productId: product.code,
        productName: product.name,
        qty: line.qty,
        sourceLineNo: line.sourceLineNo,
        unitCost: line.unitCost,
        warehouseCode: warehouse.code,
        warehouseId: warehouse.code,
        warehouseName: warehouse.name,
      }
    })
    await tx.stock_issues.update({
      data: {
        items: editedItems as Prisma.InputJsonValue,
        notes: 'QA edit pending sale',
        total_cost: editedItems.reduce((sum, item) => sum + item.costAmount, 0),
        total_est_amount: editedItems.reduce((sum, item) => sum + item.amount, 0),
      },
      where: { id: stockIssue.id },
    })
    await appendStockIssueStatusLog(tx, {
      action: STOCK_ISSUE_STATUS_ACTION.EDITED,
      actor,
      fromStatus: 'pending',
      meta: { deliveryTicketDocNo: ticket.doc_no, reason: 'qa_pending_sale_edit', reverseRefType: 'PSALE-CANCEL' },
      note: 'QA edit pending sale',
      stockIssueId: stockIssue.id,
      toStatus: 'pending',
    })

    const reversedHolds = await reversePendingSaleStockIssue(tx, {
      actor,
      cancelDate: normalizeDate(qaDate),
      note: 'QA reverse pending sale',
      stockIssueDocNo: stockIssue.doc_no,
    })
    await tx.stock_issues.update({
      data: { notes: 'QA reverse pending sale', status: 'cancelled' },
      where: { id: stockIssue.id },
    })
    await appendStockIssueStatusLog(tx, {
      action: STOCK_ISSUE_STATUS_ACTION.CANCELLED,
      actor,
      fromStatus: 'pending',
      meta: { reason: 'qa_pending_sale_cancel', reverseRefType: 'PSALE-CANCEL' },
      note: 'QA reverse pending sale',
      stockIssueId: stockIssue.id,
      toStatus: 'cancelled',
    })

    await tx.weight_tickets.update({
      data: { status: 'delivered', updated_at: new Date(), updated_by: actor },
      where: { id: ticket.id },
    })
    await appendWeightTicketStatusLog(tx, {
      action: WEIGHT_TICKET_STATUS_ACTION.USAGE_STATUS_CHANGED,
      actor,
      createdAt: new Date(),
      fromStatus: 'partially_billed',
      meta: { reason: 'qa_pending_sale_cancel', stockIssueDocNo: stockIssue.doc_no },
      note: 'QA reverse pending sale',
      toStatus: 'delivered',
      weightTicketId: ticket.id,
    })

    return { docNo: stockIssue.doc_no, holdCount: reversedHolds.length, ticketDocNo: ticket.doc_no }
  }, { timeout: 30000 })

  const ledger = await prisma.stock_ledger.groupBy({
    _sum: { qty_in: true, qty_out: true },
    by: ['ref_type'],
    where: { ref_no: result.docNo, ref_type: { in: ['PSALE', 'PSALE-CANCEL'] } },
  })
  const refTypes = ledger.map((row) => row.ref_type).sort()
  assert(refTypes.includes('PSALE') && refTypes.includes('PSALE-CANCEL'), `PSALE QA ${result.docNo} missing ledger/ref reversal`)
  const net = ledger.reduce((sum, row) => sum + toNumber(row._sum.qty_in) - toNumber(row._sum.qty_out), 0)
  assert(Math.abs(net) <= 0.000001, `PSALE QA ${result.docNo} net qty is not zero`)

  return { docNo: result.docNo, kind: 'PSALE_EDIT_CANCEL', refs: [result.ticketDocNo, `holds:${result.holdCount}`] }
}

async function findProductionQaScenario(): Promise<ProductionQaScenario> {
  const rows = await prisma.$queryRaw<ProductionQaScenario[]>`
    with available_source as (
      select
        sl.branch_id,
        sl.product_id,
        sl.warehouse_id,
        sl.output_category::text as source_status,
        sum(coalesce(sl.qty_in, 0) - coalesce(sl.qty_out, 0)) as qty,
        sum(coalesce(sl.value_in, 0) - coalesce(sl.value_out, 0)) as value
      from public.stock_ledger sl
      where sl.output_category in ('RM', 'FG')
        and (sl.not_available_for_sale is false or sl.not_available_for_sale is null)
        and sl.branch_id is not null
        and sl.product_id is not null
        and sl.warehouse_id is not null
      group by sl.branch_id, sl.product_id, sl.warehouse_id, sl.output_category
      having sum(coalesce(sl.qty_in, 0) - coalesce(sl.qty_out, 0)) >= 1
         and sum(coalesce(sl.value_in, 0) - coalesce(sl.value_out, 0)) > 0
    )
    select
      b.code::text as branch_code,
      dw.code::text as destination_warehouse_code,
      p.code::text as product_code,
      a.source_status::text as source_status,
      sw.code::text as source_warehouse_code,
      ww.code::text as wip_warehouse_code
    from available_source a
    join public.branches b on b.id = a.branch_id and b.active is true and length(trim(b.code)) > 0
    join public.products p on p.id = a.product_id and p.active is true and length(trim(p.code)) > 0
    join public.warehouses sw on sw.id = a.warehouse_id and sw.active is true and length(trim(sw.code)) > 0
    join lateral (
      select w.code
      from public.warehouses w
      where w.active is true
        and w.branch_id = a.branch_id
        and upper(coalesce(w.type, '')) = 'WIP'
        and length(trim(w.code)) > 0
      order by w.code
      limit 1
    ) ww on true
    join lateral (
      select w.code
      from public.warehouses w
      where w.active is true
        and w.branch_id = a.branch_id
        and upper(coalesce(w.type, '')) <> 'WIP'
        and length(trim(w.code)) > 0
      order by case when upper(coalesce(w.type, '')) = 'FG' then 0 else 1 end, w.code
      limit 1
    ) dw on true
    order by a.qty desc, b.code, p.code, sw.code
    limit 1
  `
  const scenario = rows[0]
  assert(scenario, 'ไม่พบ production QA scenario ที่มี stock ledger, WIP warehouse, และ destination warehouse ครบถ้วน')
  assert(scenario.source_status === 'RM' || scenario.source_status === 'FG', `production QA source status ไม่รองรับ: ${scenario.source_status}`)
  return scenario
}

async function qaProductionInputOutputReverse(): Promise<QaResult> {
  const [scenario, options] = await Promise.all([findProductionQaScenario(), productionOrderOptions()])
  const productionType = options.productionTypes[0]
  assert(productionType, 'ไม่พบ production type สำหรับ QA')
  const order = await createProductionOrder({
    branchCode: scenario.branch_code,
    date: qaDate,
    destinationWarehouseCode: scenario.destination_warehouse_code,
    notes: 'QA production ledger append/reversal',
    productionType,
    sourceWarehouseCode: scenario.source_warehouse_code,
    targetProductCode: scenario.product_code,
    wipWarehouseCode: scenario.wip_warehouse_code,
  }, actor)
  const input = await createProductionInput(order.docNo, {
    date: qaDate,
    lines: [{
      netQty: 1,
      productCode: scenario.product_code,
      sourceWarehouseCode: scenario.source_warehouse_code,
      stockStatus: scenario.source_status,
    }],
    notes: 'QA PI',
  }, actor)
  const output = await createProductionOutput(order.docNo, {
    completeOrder: false,
    date: qaDate,
    lines: [{
      categoryCode: 'FG',
      destinationWarehouseCode: scenario.destination_warehouse_code,
      netQty: 1,
      productCode: scenario.product_code,
    }],
    lossQty: 0,
    notes: 'QA PO2',
  }, actor)
  const outputRev = await reverseProductionOutput(order.docNo, output.outputDocNo, {
    date: qaDate,
    reason: 'QA reverse PO2',
  }, actor)
  const inputRev = await reverseProductionInput(order.docNo, input.inputDocNo, {
    date: qaDate,
    reason: 'QA reverse PI',
  }, actor)

  const refs = [input.inputDocNo, output.outputDocNo, outputRev.reversalDocNo, inputRev.reversalDocNo]
  const ledgerRows = await prisma.stock_ledger.groupBy({
    _sum: { qty_in: true, qty_out: true },
    by: ['ref_type'],
    where: { ref_no: { in: refs }, ref_type: { in: ['PI', 'PI-REV', 'PO2', 'PO2-REV'] } },
  })
  for (const refType of ['PI', 'PI-REV', 'PO2', 'PO2-REV']) {
    assert(ledgerRows.some((row) => row.ref_type === refType), `Production QA ${order.docNo} missing ${refType}`)
  }

  return { docNo: order.docNo, kind: 'PRODUCTION_LEDGER', refs }
}

async function main() {
  const psale = await qaPendingSaleCancel()
  const production = await qaProductionInputOutputReverse()
  await assertNoReconciliationIssues()
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    ok: true,
    results: [psale, production],
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
