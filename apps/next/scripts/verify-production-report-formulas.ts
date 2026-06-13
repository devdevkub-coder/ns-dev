import nextEnv from '@next/env'
import type { ProductionOrderMetric } from '../src/lib/server/production-reports'

const projectDir = new URL('..', import.meta.url).pathname
const { loadEnvConfig } = nextEnv
loadEnvConfig(projectDir)

const tolerance = 0.000001

function nearlyEqual(actual: number, expected: number) {
  return Math.abs(actual - expected) <= tolerance
}

function assertNearlyEqual(label: string, actual: number, expected: number) {
  if (nearlyEqual(actual, expected)) return
  throw new Error(`${label} expected ${expected}, got ${actual}`)
}

function verifyRows(label: string, rows: ProductionOrderMetric[]) {
  rows.forEach((row) => {
    const rowLabel = `${label} row ${row.docNo}`
    const expectedRmCostPerKg = row.inputQty > 0 ? row.inputCost / row.inputQty : 0
    const expectedProductionCostPerKg = row.outputQty > 0 ? row.totalCost / row.outputQty : 0
    const expectedLossValue = row.lossQty * expectedRmCostPerKg
    const expectedYieldPct = row.inputQty > 0 ? row.outputQty / row.inputQty * 100 : 0

    assertNearlyEqual(`${rowLabel} rmCostPerKg`, row.rmCostPerKg, expectedRmCostPerKg)
    assertNearlyEqual(`${rowLabel} productionCostPerKg`, row.productionCostPerKg, expectedProductionCostPerKg)
    assertNearlyEqual(`${rowLabel} costPerKg`, row.costPerKg, expectedProductionCostPerKg)
    assertNearlyEqual(`${rowLabel} lossValue`, row.lossValue, expectedLossValue)
    assertNearlyEqual(`${rowLabel} yieldPct`, row.yieldPct, expectedYieldPct)
  })
}

function sampleRow(overrides: Partial<ProductionOrderMetric>): ProductionOrderMetric {
  return {
    branchName: 'QA Branch',
    costAllocationMethod: 'actual',
    costBreakdown: {},
    costPerKg: 0,
    date: '2026-06-13',
    docNo: 'QA-PO',
    id: 'QA-PO',
    inputCost: 0,
    inputQty: 0,
    ledgerBalanced: true,
    ledgerMismatchQty: 0,
    lossPct: 0,
    lossQty: 0,
    lossValue: 0,
    machineName: 'QA Machine',
    normalLossPercent: 0,
    outputProducts: [],
    outputQty: 0,
    outputValue: 0,
    processCost: 0,
    productionCostPerKg: 0,
    productionLineName: 'QA Line',
    productionType: 'Sorting',
    productCode: 'QA-FG',
    productName: 'QA Product',
    rmCostPerKg: 0,
    status: 'Completed',
    totalCost: 0,
    variance: 0,
    warehouseName: 'QA Warehouse',
    wipQty: 0,
    wipValue: 0,
    yieldPct: 0,
    ...overrides,
  }
}

async function main() {
  const [{ loadProductionMetrics, summarizeProductionMetrics, summarizeProductionOutputProducts }, { prisma }] = await Promise.all([
    import('../src/lib/server/production-reports'),
    import('../src/lib/server/prisma'),
  ])

  const fixtureRows = [
    sampleRow({
      costPerKg: 150,
      docNo: 'QA-PO-001',
      inputCost: 1200,
      inputQty: 10,
      lossPct: 20,
      lossQty: 2,
      lossValue: 240,
      outputProducts: [{ cost: 1200, productCode: 'QA-FG-1', productName: 'QA Product 1', qty: 8, unitCost: 150 }],
      outputQty: 8,
      processCost: 0,
      productionCostPerKg: 150,
      rmCostPerKg: 120,
      totalCost: 1200,
      yieldPct: 80,
    }),
    sampleRow({
      costPerKg: 0,
      docNo: 'QA-PO-ZERO',
      processCost: 50,
      totalCost: 50,
    }),
  ]
  verifyRows('fixture production report', fixtureRows)
  const fixtureSummary = summarizeProductionMetrics(fixtureRows)
  assertNearlyEqual('fixture summary lossValue', fixtureSummary.lossValue, 240)
  assertNearlyEqual('fixture summary rmCostPerKg', fixtureSummary.rmCostPerKg, 120)
  assertNearlyEqual('fixture summary productionCostPerKg', fixtureSummary.productionCostPerKg, 156.25)

  const rows = await loadProductionMetrics()
  verifyRows('database production report', rows)
  const summary = summarizeProductionMetrics(rows)
  const productSummary = summarizeProductionOutputProducts(rows)

  const totalInputQty = rows.reduce((sum, row) => sum + row.inputQty, 0)
  const totalOutputQty = rows.reduce((sum, row) => sum + row.outputQty, 0)
  const totalLossQty = rows.reduce((sum, row) => sum + row.lossQty, 0)
  const totalInputCost = rows.reduce((sum, row) => sum + row.inputCost, 0)
  const totalProcessCost = rows.reduce((sum, row) => sum + row.processCost, 0)
  const totalCost = totalInputCost + totalProcessCost
  const totalLossValue = rows.reduce((sum, row) => sum + row.lossValue, 0)

  assertNearlyEqual('summary inputQty', summary.inputQty, totalInputQty)
  assertNearlyEqual('summary outputQty', summary.outputQty, totalOutputQty)
  assertNearlyEqual('summary lossQty', summary.lossQty, totalLossQty)
  assertNearlyEqual('summary inputCost', summary.inputCost, totalInputCost)
  assertNearlyEqual('summary processCost', summary.processCost, totalProcessCost)
  assertNearlyEqual('summary totalCost', summary.totalCost, totalCost)
  assertNearlyEqual('summary lossValue', summary.lossValue, totalLossValue)
  assertNearlyEqual('summary rmCostPerKg', summary.rmCostPerKg, totalInputQty > 0 ? totalInputCost / totalInputQty : 0)
  assertNearlyEqual('summary productionCostPerKg', summary.productionCostPerKg, totalOutputQty > 0 ? totalCost / totalOutputQty : 0)
  assertNearlyEqual('summary costPerKg', summary.costPerKg, totalOutputQty > 0 ? totalCost / totalOutputQty : 0)
  assertNearlyEqual('summary yieldPct', summary.yieldPct, totalInputQty > 0 ? totalOutputQty / totalInputQty * 100 : 0)
  assertNearlyEqual('summary lossPct', summary.lossPct, totalInputQty > 0 ? totalLossQty / totalInputQty * 100 : 0)

  const rowOutputQty = rows.flatMap((row) => row.outputProducts).reduce((sum, output) => sum + output.qty, 0)
  const rowOutputCost = rows.flatMap((row) => row.outputProducts).reduce((sum, output) => sum + output.cost, 0)
  const summaryOutputQty = productSummary.reduce((sum, output) => sum + output.qty, 0)
  const summaryOutputCost = productSummary.reduce((sum, output) => sum + output.cost, 0)

  assertNearlyEqual('product summary qty', summaryOutputQty, rowOutputQty)
  assertNearlyEqual('product summary cost', summaryOutputCost, rowOutputCost)
  productSummary.forEach((output) => {
    assertNearlyEqual(`product summary ${output.code || output.name} unitCost`, output.unitCost, output.qty > 0 ? output.cost / output.qty : 0)
  })

  console.log(JSON.stringify({
    checkedRows: rows.length,
    generatedAt: new Date().toISOString(),
    ok: true,
    productSummaryRows: productSummary.length,
    summary: {
      inputQty: summary.inputQty,
      lossValue: summary.lossValue,
      outputQty: summary.outputQty,
      productionCostPerKg: summary.productionCostPerKg,
      rmCostPerKg: summary.rmCostPerKg,
      yieldPct: summary.yieldPct,
    },
  }, null, 2))
  await prisma.$disconnect()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
