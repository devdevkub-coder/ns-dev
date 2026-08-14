import nextEnv from '@next/env'
import { fileURLToPath } from 'node:url'
import type { Prisma } from '../generated/prisma/client'

const projectDir = fileURLToPath(new URL('..', import.meta.url))
const { loadEnvConfig } = nextEnv
loadEnvConfig(projectDir)

const rollbackSentinel = new Error('ROLLBACK_SALES_BILL_CANCEL_EDGE_CASES_QA')
const qaPrefix = `QA-SB-CANCEL-EDGE-${Date.now().toString(36)}`
const actor = 'qa-sales-bill-cancel-edge-cases'

function assertEqual(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) return
  throw new Error(`${label} expected ${String(expected)}, got ${String(actual)}`)
}

function assertNear(label: string, actual: number, expected: number, tolerance = 0.000001) {
  if (Math.abs(actual - expected) <= tolerance) return
  throw new Error(`${label} expected ${expected}, got ${actual}`)
}

async function main() {
  const [
    { prisma },
    { normalizeDate, toNumber },
    { activeSalesReceiptCount },
    { reversePoSellUsage },
    { cancelSalesBillLineFacts },
    { appendSalesBillStatusLog, SALES_BILL_STATUS, SALES_BILL_STATUS_ACTION },
  ] = await Promise.all([
    import('../src/lib/server/prisma'),
    import('../src/lib/server/daily'),
    import('../src/lib/server/sales-bill-cancel-policy'),
    import('../src/lib/server/sales-bill-po-sell-reversal'),
    import('../src/lib/server/sales-bill-cancellation'),
    import('../src/lib/server/sales-bill-history'),
  ])

  let assertions = 0
  let rolledBack = false
  const date = normalizeDate('2026-06-14')
  const cancelledAt = new Date('2026-06-14T10:00:00.000Z')

  try {
    await prisma.$transaction(async (tx) => {
      const branch = await tx.branches.create({
        data: { code: `${qaPrefix}-BR`, name: `${qaPrefix} Branch` },
      })
      const warehouse = await tx.warehouses.create({
        data: { branch_id: branch.id, code: `${qaPrefix}-WH`, name: `${qaPrefix} Warehouse` },
      })
      const customer = await tx.customers.create({
        data: { code: `${qaPrefix}-CU`, name: `${qaPrefix} Customer` },
      })
      const product = await tx.products.create({
        data: { code: `${qaPrefix}-P1`, name: `${qaPrefix} Product`, unit: 'kg' },
      })
      const channel = await tx.sales_channels.create({
        data: { code: `${qaPrefix}-SC`, name: `${qaPrefix} Channel` },
      })
      const account = await tx.accounts.create({
        data: { bank_name: 'QA Bank', code: `${qaPrefix}-AC`, name: `${qaPrefix} Account`, type: 'bank' },
      })
      const paymentMethod = await tx.payment_methods.create({
        data: { code: `${qaPrefix}-PM`, name: `${qaPrefix} Payment`, type: 'bank' },
      })
      const poSell = await tx.po_sells.create({
        data: {
          branch_id: branch.id,
          channel_id: channel.id,
          customer_id: customer.id,
          cut_amount: 400,
          date,
          doc_no: `${qaPrefix}-POSELL`,
          items: [{ productCode: product.code, qty: 100, remainingQty: 60, unitPrice: 10 }] as Prisma.InputJsonValue,
          product_id: product.id,
          qty: 100,
          remaining_amount: 600,
          remaining_qty: 60,
          status: 'Completed',
          total_amount: 1000,
          unit_price: 10,
          warehouse_id: warehouse.id,
        },
      })
      const billItems = [{
        amount: 400,
        lineNo: 1,
        poSellId: poSell.doc_no,
        price: 10,
        productCode: product.code,
        productId: product.code,
        productName: product.name,
        qty: 40,
      }]
      const bill = await tx.sales_bills.create({
        data: {
          branch_id: branch.id,
          channel_id: channel.id,
          customer_id: customer.id,
          date,
          doc_no: `${qaPrefix}-SB`,
          gross_profit: 100,
          items: billItems as Prisma.InputJsonValue,
          receivable_balance: 400,
          received_amount: 0,
          status: 'open',
          subtotal: 400,
          total_amount: 400,
          transaction_mode: 'TRADING',
          warehouse_id: warehouse.id,
        },
      })
      const originalLineNote = 'หมายเหตุสินค้าเดิม'
      const cancelReason = 'ยกเลิกเพื่อทดสอบ'
      const line = await tx.sales_bill_lines.create({
        data: {
          line_amount: 400,
          line_no: 1,
          notes: originalLineNote,
          product_code_snapshot: product.code,
          product_id: product.id,
          product_name_snapshot: product.name,
          qty: 40,
          sales_bill_id: bill.id,
          unit_price: 10,
        },
      })
      await tx.sales_bill_po_sell_allocations.create({
        data: {
          allocated_amount: 400,
          allocated_qty: 40,
          allocation_type: 'PO_SELL',
          po_sell_doc_no: poSell.doc_no,
          po_sell_id: poSell.id,
          product_code_snapshot: product.code,
          product_id: product.id,
          product_name_snapshot: product.name,
          sales_bill_id: bill.id,
          sales_bill_line_id: line.id,
          sales_line_no: 1,
          unit_price: 10,
        },
      })
      await tx.sales_bill_customer_advance_allocations.create({
        data: {
          allocated_amount: 100,
          allocated_subtotal_amount: 100,
          allocated_total_amount: 100,
          customer_advance_doc_no: `${qaPrefix}-ADV`,
          customer_code_snapshot: customer.code,
          customer_id: customer.id,
          customer_name_snapshot: customer.name,
          outstanding_after: 0,
          outstanding_before: 100,
          sales_bill_id: bill.id,
        },
      })
      await tx.trading_allocation_facts.create({
        data: {
          allocation_no: `${qaPrefix}-ALLOC`,
          customer_id: customer.id,
          customer_name_snapshot: customer.name,
          date,
          matched_cogs: 300,
          product_code_snapshot: product.code,
          product_id: product.id,
          product_name_snapshot: product.name,
          qty: 40,
          sales_amount: 400,
          sales_bill_id: bill.id,
          sales_doc_no: bill.doc_no,
          sales_line_no: 1,
          source_doc_no: `${qaPrefix}-PB`,
          source_type: 'TRADING_PURCHASE_BILL',
        },
      })
      const receipt = await tx.customer_receipts.create({
        data: {
          account_code_snapshot: account.code,
          account_id: account.id,
          account_name_snapshot: account.name,
          branch_id: branch.id,
          customer_code_snapshot: customer.code,
          customer_id: customer.id,
          customer_name_snapshot: customer.name,
          date,
          doc_no: `${qaPrefix}-RCP`,
          gross_amount: 50,
          net_cash_in: 50,
          payment_method_code_snapshot: paymentMethod.code,
          payment_method_id: paymentMethod.id,
          payment_method_name_snapshot: paymentMethod.name,
        },
      })
      await tx.customer_receipt_allocations.create({
        data: {
          allocated_ar_amount: 50,
          customer_code_snapshot: customer.code,
          line_no: 1,
          outstanding_after: 350,
          outstanding_before: 400,
          receipt_amount: 50,
          receipt_id: receipt.id,
          sales_bill_doc_no_snapshot: bill.doc_no,
          sales_bill_id: bill.id,
        },
      })

      assertEqual('active RCP locks sales bill cancel', await activeSalesReceiptCount(tx, bill.id), 1)
      assertions += 1

      await reversePoSellUsage(tx, bill.items, actor, cancelledAt)
      const restoredPoSell = await tx.po_sells.findUniqueOrThrow({ where: { id: poSell.id } })
      assertNear('PO Sell remaining qty restored', toNumber(restoredPoSell.remaining_qty), 100)
      assertNear('PO Sell cut amount reversed', toNumber(restoredPoSell.cut_amount), 0)
      assertNear('PO Sell remaining amount restored', toNumber(restoredPoSell.remaining_amount), 1000)
      assertEqual('PO Sell reopened after restore', restoredPoSell.status, 'Open')
      assertions += 4

      await Promise.all([
        tx.trading_allocation_facts.updateMany({
          data: { notes: 'QA cancel', status: 'cancelled', updated_at: cancelledAt, updated_by: actor },
          where: { sales_bill_id: bill.id, status: 'active' },
        }),
        tx.sales_bill_customer_advance_allocations.updateMany({
          data: { notes: 'QA cancel', status: 'cancelled', updated_at: cancelledAt, updated_by: actor },
          where: { sales_bill_id: bill.id, status: 'active' },
        }),
        tx.sales_bill_po_sell_allocations.updateMany({
          data: { notes: 'QA cancel', status: 'cancelled', updated_at: cancelledAt, updated_by: actor },
          where: { sales_bill_id: bill.id, status: 'active' },
        }),
      ])
      assertEqual('Trading allocation fact cancelled', await tx.trading_allocation_facts.count({ where: { sales_bill_id: bill.id, status: 'cancelled' } }), 1)
      assertEqual('Customer advance allocation released by cancellation', await tx.sales_bill_customer_advance_allocations.count({ where: { sales_bill_id: bill.id, status: 'cancelled' } }), 1)
      assertEqual('PO Sell allocation fact cancelled', await tx.sales_bill_po_sell_allocations.count({ where: { sales_bill_id: bill.id, status: 'cancelled' } }), 1)
      assertions += 3

      await cancelSalesBillLineFacts(tx, {
        actor,
        cancelledAt,
        salesBillId: bill.id,
      })

      await tx.sales_bills.update({
        data: {
          cancel_note: cancelReason,
          cancelled_at: cancelledAt,
          cancelled_by: actor,
          receivable_balance: 0,
          status: SALES_BILL_STATUS.CANCELLED,
        },
        where: { id: bill.id },
      })

      await appendSalesBillStatusLog(tx, {
        action: SALES_BILL_STATUS_ACTION.CANCELLED,
        actor,
        createdAt: cancelledAt,
        fromStatus: bill.status,
        meta: { reason: 'sales_bill_cancel' },
        note: cancelReason,
        salesBillId: bill.id,
        toStatus: SALES_BILL_STATUS.CANCELLED,
      })

      const [cancelledLine, cancelledBill, cancellationLog] = await Promise.all([
        tx.sales_bill_lines.findUniqueOrThrow({ where: { id: line.id } }),
        tx.sales_bills.findUniqueOrThrow({ where: { id: bill.id } }),
        tx.sales_bill_status_logs.findFirstOrThrow({
          orderBy: { created_at: 'desc' },
          where: {
            action: SALES_BILL_STATUS_ACTION.CANCELLED,
            sales_bill_id: bill.id,
          },
        }),
      ])

      assertEqual('line business note preserved', cancelledLine.notes, originalLineNote)
      assertEqual('line state cancelled', cancelledLine.status, 'cancelled')
      assertEqual('header cancellation reason stored', cancelledBill.cancel_note, cancelReason)
      assertEqual('status timeline reason stored', cancellationLog.note, cancelReason)
      assertions += 4

      throw rollbackSentinel
    })
  } catch (caught) {
    if (caught === rollbackSentinel) rolledBack = true
    else throw caught
  }

  assertEqual('QA transaction rolled back', rolledBack, true)
  assertions += 1
  console.log(`verify-sales-bill-cancel-edge-cases passed (${assertions} assertions, rolled back)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
