import {
  createProductionInput,
  createProductionOrder,
  createProductionOutput,
  productionOrderOptions,
  returnProductionInput,
  reverseProductionOutput,
} from '../src/lib/server/production-orders'
import { toNumber } from '../src/lib/server/daily'
import { prisma } from '../src/lib/server/prisma'
import { buildProductionReconciliationReport } from '../src/lib/server/production-reconciliation'

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
  const machine = options.machines[0]
  const productionLine = options.productionLines[0]
  assert(machine, 'ไม่พบเครื่องจักรสำหรับ QA')
  assert(machine.type, 'ไม่พบประเภทเครื่องจักรสำหรับ QA')
  assert(productionLine, 'ไม่พบไลน์ผลิตสำหรับ QA')
  const order = await createProductionOrder({
    branchCode: scenario.branch_code,
    destinationWarehouseCode: scenario.destination_warehouse_code,
    notes: 'QA production ledger append/reversal',
    machineCode: machine.code,
    productionLineCode: productionLine.code,
    shift: 'เช้า',
    targetProductCode: scenario.product_code,
  }, actor)
  const input = await createProductionInput(order.docNo, {
    lines: [{
      netQty: 1,
      productCode: scenario.product_code,
      sourceWarehouseCode: scenario.source_warehouse_code,
      stockStatus: scenario.source_status,
    }],
  }, actor)
  const output = await createProductionOutput(order.docNo, {
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
  const inputRows = await prisma.production_inputs.findMany({ where: { doc_no: input.inputDocNo, order_id: BigInt(order.id), status: 'active' }, select: { id: true, qty: true } })
  await returnProductionInput(order.docNo, {
    lines: inputRows.map((inputRow) => ({ inputId: inputRow.id, qty: Number(inputRow.qty) })),
    reason: 'QA return PI',
  }, actor)

  const refs = [input.inputDocNo, output.outputDocNo, outputRev.reversalDocNo]
  const ledgerRows = await prisma.stock_ledger.groupBy({
    _sum: { qty_in: true, qty_out: true },
    by: ['ref_type'],
    where: { ref_no: { in: refs }, ref_type: { in: ['PI', 'PI-RETURN', 'PO2', 'PO2-REV'] } },
  })
  for (const refType of ['PI', 'PI-RETURN', 'PO2', 'PO2-REV']) {
    assert(ledgerRows.some((row: { ref_type: string | null }) => row.ref_type === refType), `Production QA ${order.docNo} missing ${refType}`)
  }

  return { docNo: order.docNo, kind: 'PRODUCTION_LEDGER', refs }
}

async function main() {
  const production = await qaProductionInputOutputReverse()
  await assertNoReconciliationIssues()
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    ok: true,
    results: [production],
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
