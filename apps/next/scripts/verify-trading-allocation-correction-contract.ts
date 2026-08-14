import nextEnv from '@next/env'
import { fileURLToPath } from 'node:url'

const projectDir = fileURLToPath(new URL('..', import.meta.url))
const { loadEnvConfig } = nextEnv
loadEnvConfig(projectDir)

const rollbackSentinel = new Error('ROLLBACK_TRADING_ALLOCATION_CORRECTION_QA')
const qaPrefix = `QA-TAC-${Date.now().toString(36)}`

function assertEqual(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) return
  throw new Error(`${label} expected ${String(expected)}, got ${String(actual)}`)
}

function assertNear(label: string, actual: number, expected: number, tolerance = 0.000001) {
  if (Math.abs(actual - expected) <= tolerance) return
  throw new Error(`${label} expected ${expected}, got ${actual}`)
}

async function expectRejects(label: string, action: () => Promise<unknown>, messagePart: string) {
  try {
    await action()
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught)
    if (message.includes(messagePart)) return
    throw new Error(`${label} rejected with unexpected message: ${message}`)
  }
  throw new Error(`${label} did not reject`)
}

async function main() {
  const [{ prisma }, { correctTradingSalesBillAllocations }] = await Promise.all([
    import('../src/lib/server/prisma'),
    import('../src/lib/server/trading-sales-bill-allocation-correction'),
  ])

  let assertions = 0
  try {
    await prisma.$transaction(async (tx) => {
      const today = new Date('2026-06-14T00:00:00.000Z')
      const branch = await tx.branches.create({
        data: { code: `${qaPrefix}-BR`, name: `${qaPrefix} Branch` },
      })
      const salesChannel = await tx.sales_channels.create({
        data: { code: `${qaPrefix}-SC`, name: `${qaPrefix} Sales Channel` },
      })
      const supplier = await tx.suppliers.create({
        data: { branch_id: branch.id, code: `${qaPrefix}-SU`, name: `${qaPrefix} Supplier` },
      })
      const customer = await tx.customers.create({
        data: { code: `${qaPrefix}-CU`, name: `${qaPrefix} Customer` },
      })
      const product = await tx.products.create({
        data: { code: `${qaPrefix}-P1`, name: `${qaPrefix} Product 1` },
      })
      const otherProduct = await tx.products.create({
        data: { code: `${qaPrefix}-P2`, name: `${qaPrefix} Product 2` },
      })

      const pb = await tx.purchase_bills.create({
        data: {
          branch_id: branch.id,
          date: today,
          doc_no: `${qaPrefix}-PB`,
          status: 'partial',
          supplier_id: supplier.id,
          supplier_name_snapshot: supplier.name,
          total_amount: 1000,
          transaction_mode: 'TRADING',
        },
      })
      await tx.purchase_bill_items.create({
        data: {
          amount: 1000,
          line_no: 1,
          price: 10,
          product_code: product.code,
          product_id: product.id,
          product_name: product.name,
          purchase_bill_id: pb.id,
          qty: 100,
        },
      })

      const manualSource = await tx.trading_cost_sources.create({
        data: {
          date: today,
          product_code_snapshot: product.code,
          product_id: product.id,
          product_name_snapshot: product.name,
          qty: 60,
          source_no: `${qaPrefix}-SRC`,
          supplier_id: supplier.id,
          supplier_name_snapshot: supplier.name,
          total_amount: 900,
          unit_cost: 15,
        },
      })

      await tx.trading_allocation_facts.create({
        data: {
          allocation_method: 'RECORDED_LINE',
          allocation_no: `${qaPrefix}-EXTERNAL-PB`,
          customer_id: customer.id,
          date: today,
          matched_cogs: 200,
          product_code_snapshot: product.code,
          product_id: product.id,
          product_name_snapshot: product.name,
          purchase_bill_id: pb.id,
          qty: 20,
          sales_amount: 300,
          sales_doc_no: `${qaPrefix}-EXT-SB`,
          sales_line_no: 1,
          source_doc_no: pb.doc_no,
          source_line_no: 1,
          source_type: 'TRADING_PURCHASE_BILL',
          status: 'active',
          supplier_id: supplier.id,
          supplier_name_snapshot: supplier.name,
        },
      })

      const successBill = await tx.sales_bills.create({
        data: {
          branch_id: branch.id,
          channel_id: salesChannel.id,
          customer_id: customer.id,
          date: today,
          doc_no: `${qaPrefix}-SB`,
          items: [
            { amount: 500, lineNo: 1, price: 20, productCode: product.code, productId: product.code, productName: product.name, qty: 25 },
            { amount: 500, lineNo: 2, price: 20, productCode: product.code, productId: product.code, productName: product.name, qty: 30 },
          ],
          receivable_balance: 1000,
          status: 'unreceived',
          total_amount: 1000,
          transaction_mode: 'TRADING',
        },
      })

      await tx.sales_bill_lines.createMany({
        data: [
          {
            cogs_amount: 999,
            gross_profit: -499,
            gross_weight: 25,
            line_amount: 500,
            line_no: 1,
            meta: { tradingCostSourceId: `PB:${pb.doc_no}:1` },
            net_weight: 25,
            product_code_snapshot: product.code,
            product_id: product.id,
            product_name_snapshot: product.name,
            qty: 25,
            sales_bill_id: successBill.id,
            status: 'active',
            unit_price: 20,
            unit_snapshot: 'กก.',
          },
          {
            cogs_amount: 999,
            gross_profit: -499,
            gross_weight: 30,
            line_amount: 500,
            line_no: 2,
            meta: { tradingCostSourceId: `SRC:${manualSource.source_no}:1` },
            net_weight: 30,
            product_code_snapshot: product.code,
            product_id: product.id,
            product_name_snapshot: product.name,
            qty: 30,
            sales_bill_id: successBill.id,
            status: 'active',
            unit_price: 20,
            unit_snapshot: 'กก.',
          },
        ],
      })

      await tx.trading_allocation_facts.createMany({
        data: [
          {
            allocation_method: 'RECORDED_LINE',
            allocation_no: `${qaPrefix}-OLD-1`,
            customer_id: customer.id,
            date: today,
            matched_cogs: 999,
            product_code_snapshot: product.code,
            product_id: product.id,
            product_name_snapshot: product.name,
            purchase_bill_id: pb.id,
            qty: 25,
            sales_amount: 500,
            sales_bill_id: successBill.id,
            sales_doc_no: successBill.doc_no,
            sales_line_no: 1,
            source_doc_no: pb.doc_no,
            source_line_no: 1,
            source_type: 'TRADING_PURCHASE_BILL',
            status: 'active',
            supplier_id: supplier.id,
            supplier_name_snapshot: supplier.name,
          },
          {
            allocation_method: 'RECORDED_LINE',
            allocation_no: `${qaPrefix}-OLD-2`,
            customer_id: customer.id,
            date: today,
            matched_cogs: 999,
            product_code_snapshot: product.code,
            product_id: product.id,
            product_name_snapshot: product.name,
            qty: 30,
            sales_amount: 500,
            sales_bill_id: successBill.id,
            sales_doc_no: successBill.doc_no,
            sales_line_no: 2,
            source_doc_no: manualSource.source_no,
            source_line_no: 1,
            source_type: 'TRADING_COST_SOURCE',
            status: 'active',
            supplier_id: supplier.id,
            supplier_name_snapshot: supplier.name,
            trading_cost_source_id: manualSource.id,
          },
        ],
      })

      const result = await correctTradingSalesBillAllocations(tx, {
        actor: 'qa-script',
        allocations: [
          { salesLineNo: 1, tradingCostSourceId: `PB:${pb.doc_no}:1` },
          { salesLineNo: 2, tradingCostSourceId: `SRC:${manualSource.source_no}:1` },
        ],
        billRef: successBill.doc_no,
        correctedAt: new Date('2026-06-14T01:00:00.000Z'),
        note: 'qa trading allocation correction',
      })
      assertEqual('success docNo', result.docNo, successBill.doc_no)
      assertNear('success totalCost', result.totalCost, 700)
      assertions += 2

      const facts = await tx.trading_allocation_facts.findMany({
        orderBy: [{ sales_line_no: 'asc' }, { allocation_no: 'asc' }],
        where: { sales_bill_id: successBill.id },
      })
      assertEqual('corrected fact count', facts.length, 4)
      assertEqual('active corrected fact count', facts.filter((fact) => fact.status === 'active').length, 2)
      assertEqual('old fact reversed count', facts.filter((fact) => fact.status === 'reversed').length, 2)
      assertNear('line 1 cogs', Number(facts.find((fact) => fact.status === 'active' && fact.sales_line_no === 1)?.matched_cogs ?? 0), 250)
      assertNear('line 2 cogs', Number(facts.find((fact) => fact.status === 'active' && fact.sales_line_no === 2)?.matched_cogs ?? 0), 450)
      assertions += 5

      const updatedBill = await tx.sales_bills.findUniqueOrThrow({
        select: { gross_profit: true, total_cost: true },
        where: { id: successBill.id },
      })
      assertNear('bill total_cost', Number(updatedBill.total_cost ?? 0), 700)
      assertNear('bill gross_profit', Number(updatedBill.gross_profit ?? 0), 300)
      assertions += 2

      const stockLedgerRows = await tx.stock_ledger.count({
        where: {
          OR: [
            { ref_no: successBill.doc_no },
            { ref_id: successBill.doc_no },
          ],
        },
      })
      assertEqual('no stock ledger from Trading correction', stockLedgerRows, 0)
      assertions += 1

      const capacityBill = await tx.sales_bills.create({
        data: {
          branch_id: branch.id,
          channel_id: salesChannel.id,
          customer_id: customer.id,
          date: today,
          doc_no: `${qaPrefix}-SB-CAP`,
          items: [{ amount: 2000, lineNo: 1, price: 20, productCode: product.code, productId: product.code, productName: product.name, qty: 90 }],
          receivable_balance: 2000,
          status: 'unreceived',
          total_amount: 2000,
          transaction_mode: 'TRADING',
        },
      })
      await tx.sales_bill_lines.create({
        data: {
          line_amount: 2000,
          line_no: 1,
          net_weight: 90,
          product_code_snapshot: product.code,
          product_id: product.id,
          product_name_snapshot: product.name,
          qty: 90,
          sales_bill_id: capacityBill.id,
          status: 'active',
          unit_price: 20,
          unit_snapshot: 'กก.',
        },
      })
      await expectRejects(
        'capacity guard',
        () => correctTradingSalesBillAllocations(tx, {
          actor: 'qa-script',
          allocations: [{ salesLineNo: 1, tradingCostSourceId: `PB:${pb.doc_no}:1` }],
          billRef: capacityBill.doc_no,
          correctedAt: new Date('2026-06-14T01:05:00.000Z'),
          note: 'qa capacity fail',
        }),
        'เกินต้นทุนคงเหลือ',
      )
      assertions += 1

      const mismatchPb = await tx.purchase_bills.create({
        data: {
          branch_id: branch.id,
          date: today,
          doc_no: `${qaPrefix}-PB-MIS`,
          status: 'partial',
          supplier_id: supplier.id,
          supplier_name_snapshot: supplier.name,
          total_amount: 300,
          transaction_mode: 'TRADING',
        },
      })
      await tx.purchase_bill_items.create({
        data: {
          amount: 300,
          line_no: 1,
          price: 10,
          product_code: otherProduct.code,
          product_id: otherProduct.id,
          product_name: otherProduct.name,
          purchase_bill_id: mismatchPb.id,
          qty: 30,
        },
      })
      const mismatchBill = await tx.sales_bills.create({
        data: {
          branch_id: branch.id,
          channel_id: salesChannel.id,
          customer_id: customer.id,
          date: today,
          doc_no: `${qaPrefix}-SB-MIS`,
          items: [{ amount: 200, lineNo: 1, price: 20, productCode: product.code, productId: product.code, productName: product.name, qty: 10 }],
          receivable_balance: 200,
          status: 'unreceived',
          total_amount: 200,
          transaction_mode: 'TRADING',
        },
      })
      await tx.sales_bill_lines.create({
        data: {
          line_amount: 200,
          line_no: 1,
          net_weight: 10,
          product_code_snapshot: product.code,
          product_id: product.id,
          product_name_snapshot: product.name,
          qty: 10,
          sales_bill_id: mismatchBill.id,
          status: 'active',
          unit_price: 20,
          unit_snapshot: 'กก.',
        },
      })
      await expectRejects(
        'product mismatch guard',
        () => correctTradingSalesBillAllocations(tx, {
          actor: 'qa-script',
          allocations: [{ salesLineNo: 1, tradingCostSourceId: `PB:${mismatchPb.doc_no}:1` }],
          billRef: mismatchBill.doc_no,
          correctedAt: new Date('2026-06-14T01:10:00.000Z'),
          note: 'qa mismatch fail',
        }),
        'ไม่ตรงกับต้นทุน',
      )
      assertions += 1

      const mixedBill = await tx.sales_bills.create({
        data: {
          branch_id: branch.id,
          channel_id: salesChannel.id,
          customer_id: customer.id,
          date: today,
          doc_no: `${qaPrefix}-SB-MIX`,
          gross_profit: 603.5,
          items: [
            {
              amount: 500,
              lineNo: 1,
              productCode: product.code,
              productId: product.code,
              productName: product.name,
              qty: 25,
              tradingCostSourceId: `PB:${pb.doc_no}:1`,
              unitPrice: 20,
            },
            {
              amount: 1000,
              deliveryTicketDocNo: `${qaPrefix}-WTO`,
              deliveryTicketId: `${qaPrefix}-WTO`,
              lineNo: 2,
              productCode: otherProduct.code,
              productId: otherProduct.code,
              productName: otherProduct.name,
              qty: 25,
              tradingCostSourceId: null,
              unitPrice: 40,
            },
          ],
          receivable_balance: 1500,
          status: 'unreceived',
          total_amount: 1500,
          total_cost: 896.5,
          transaction_mode: 'TRADING',
        },
      })

      await tx.sales_bill_lines.createMany({
        data: [
          {
            cogs_amount: 250,
            gross_profit: 250,
            gross_weight: 25,
            line_amount: 500,
            line_no: 1,
            meta: { tradingCostSourceId: `PB:${pb.doc_no}:1` },
            net_weight: 25,
            product_code_snapshot: product.code,
            product_id: product.id,
            product_name_snapshot: product.name,
            qty: 25,
            sales_bill_id: mixedBill.id,
            status: 'active',
            unit_price: 20,
            unit_snapshot: 'กก.',
          },
          {
            cogs_amount: 646.5,
            gross_profit: 353.5,
            gross_weight: 25,
            line_amount: 1000,
            line_no: 2,
            meta: { deliveryTicketId: `${qaPrefix}-WTO` },
            net_weight: 25,
            product_code_snapshot: otherProduct.code,
            product_id: otherProduct.id,
            product_name_snapshot: otherProduct.name,
            qty: 25,
            sales_bill_id: mixedBill.id,
            status: 'active',
            unit_price: 40,
            unit_snapshot: 'ลัง',
          },
        ],
      })
      const mixedLines = await tx.sales_bill_lines.findMany({
        orderBy: { line_no: 'asc' },
        where: { sales_bill_id: mixedBill.id },
      })
      const mixedLine2 = mixedLines.find((line) => line.line_no === 2)
      if (!mixedLine2) throw new Error('mixed line 2 fixture missing')

      await tx.sales_bill_source_allocations.create({
        data: {
          allocated_gross_weight: 25,
          allocated_net_weight: 25,
          allocated_qty: 25,
          movement_owner: 'SALES_BILL',
          product_code_snapshot: otherProduct.code,
          product_id: otherProduct.id,
          product_name_snapshot: otherProduct.name,
          sales_bill_id: mixedBill.id,
          sales_bill_line_id: mixedLine2.id,
          sales_line_no: 2,
          source_doc_no: `${qaPrefix}-WTO`,
          source_line_no: 1,
          source_type: 'WTO',
          status: 'active',
          stock_ledger_ref_type: 'SB',
        },
      })
      await tx.stock_ledger.create({
        data: {
          branch_id: branch.id,
          date: today,
          movement_type: 'ขายออก',
          not_available_for_sale: false,
          output_category: 'FG',
          product_id: otherProduct.id,
          qty_in: 0,
          qty_out: 25,
          ref_no: mixedBill.doc_no,
          ref_type: 'SB',
          unit_cost: 25.86,
          value_in: 0,
          value_out: 646.5,
        },
      })

      await tx.trading_allocation_facts.create({
        data: {
          allocation_method: 'RECORDED_LINE',
          allocation_no: `${qaPrefix}-MIX-OLD-1`,
          customer_id: customer.id,
          date: today,
          matched_cogs: 250,
          product_code_snapshot: product.code,
          product_id: product.id,
          product_name_snapshot: product.name,
          purchase_bill_id: pb.id,
          qty: 25,
          sales_amount: 500,
          sales_bill_id: mixedBill.id,
          sales_doc_no: mixedBill.doc_no,
          sales_line_no: 1,
          source_doc_no: pb.doc_no,
          source_line_no: 1,
          source_type: 'TRADING_PURCHASE_BILL',
          status: 'active',
          supplier_id: supplier.id,
          supplier_name_snapshot: supplier.name,
        },
      })

      const mixedResult = await correctTradingSalesBillAllocations(tx, {
        actor: 'qa-script',
        allocations: [
          { salesLineNo: 1, tradingCostSourceId: `PB:${pb.doc_no}:1` },
        ],
        billRef: mixedBill.doc_no,
        correctedAt: new Date('2026-06-14T01:15:00.000Z'),
        note: 'qa mixed trading allocation correction',
      })
      assertEqual('mixed correction docNo', mixedResult.docNo, mixedBill.doc_no)
      assertions += 1

      const [mixedUpdatedLines, mixedActiveFacts, mixedHeader, mixedLedger, mixedProjectedFacts] = await Promise.all([
        tx.sales_bill_lines.findMany({
          orderBy: { line_no: 'asc' },
          where: { sales_bill_id: mixedBill.id, status: 'active' },
        }),
        tx.trading_allocation_facts.findMany({
          where: { sales_bill_id: mixedBill.id, status: 'active' },
        }),
        tx.sales_bills.findUniqueOrThrow({ where: { id: mixedBill.id } }),
        tx.stock_ledger.findFirstOrThrow({
          where: { ref_no: mixedBill.doc_no, ref_type: 'SB' },
        }),
        tx.report_profit_cost_facts.findMany({
          orderBy: { source_line_no: 'asc' },
          where: {
            fact_type: 'SALE',
            source_doc_no: mixedBill.doc_no,
            source_type: 'SALES_BILL',
          },
        }),
      ])
      const mixedWtoLine = mixedUpdatedLines.find((line) => line.line_no === 2)
      const correctedTradingFact = mixedActiveFacts.find((fact) => fact.sales_line_no === 1)
      if (!mixedWtoLine || !correctedTradingFact) throw new Error('mixed correction result missing')
      const correctedTradingCogs = Number(correctedTradingFact.matched_cogs)
      const mixedLineCostTotal = mixedUpdatedLines.reduce(
        (sum, line) => sum + Number(line.cogs_amount ?? 0),
        0,
      )

      assertNear('mixed WTO line COGS preserved', Number(mixedWtoLine.cogs_amount), 646.5)
      assertEqual('mixed WTO line has no Trading fact', mixedActiveFacts.some((fact) => fact.sales_line_no === 2), false)
      assertNear('mixed header includes Trading plus WTO COGS', Number(mixedHeader.total_cost), correctedTradingCogs + 646.5)
      assertNear('mixed return includes Trading plus WTO COGS', mixedResult.totalCost, correctedTradingCogs + 646.5)
      assertNear('mixed line/header COGS reconcile', mixedLineCostTotal, Number(mixedHeader.total_cost))
      assertNear('mixed stock ledger unchanged', Number(mixedLedger.value_out), 646.5)
      assertEqual('mixed projector line count', mixedProjectedFacts.length, 2)
      assertNear('mixed projector Trading COGS', Number(mixedProjectedFacts[0]?.cogs_amount ?? 0), correctedTradingCogs)
      assertNear('mixed projector WTO COGS', Number(mixedProjectedFacts[1]?.cogs_amount ?? 0), 646.5)
      assertions += 9

      await expectRejects(
        'mixed WTO line correction guard',
        () => correctTradingSalesBillAllocations(tx, {
          actor: 'qa-script',
          allocations: [
            { salesLineNo: 2, tradingCostSourceId: `PB:${pb.doc_no}:1` },
          ],
          billRef: mixedBill.doc_no,
          correctedAt: new Date('2026-06-14T01:20:00.000Z'),
          note: 'qa must reject WTO correction',
        }),
        'รายการ WTO/Stock ไม่สามารถแก้เป็น Trading allocation',
      )
      assertions += 1

      throw rollbackSentinel
    }, { timeout: 60_000 })
  } catch (caught) {
    if (caught !== rollbackSentinel) throw caught
  } finally {
    await prisma.$disconnect()
  }

  console.log(JSON.stringify({
    assertions,
    ok: true,
    rolledBack: true,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
