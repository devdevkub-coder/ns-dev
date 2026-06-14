import nextEnv from '@next/env'

const projectDir = new URL('..', import.meta.url).pathname
const { loadEnvConfig } = nextEnv
loadEnvConfig(projectDir)

const qaPrefix = `QA-SBA-RM-${Date.now().toString(36)}`

function assertEqual(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) return
  throw new Error(`${label} expected ${String(expected)}, got ${String(actual)}`)
}

function assertNear(label: string, actual: number, expected: number, tolerance = 0.000001) {
  if (Math.abs(actual - expected) <= tolerance) return
  throw new Error(`${label} expected ${expected}, got ${actual}`)
}

async function cleanup(prisma: Awaited<typeof import('../src/lib/server/prisma')>['prisma']) {
  const salesBills = await prisma.sales_bills.findMany({
    select: { id: true },
    where: { doc_no: { startsWith: qaPrefix } },
  })
  const salesBillIds = salesBills.map((bill) => bill.id)
  if (salesBillIds.length) {
    await prisma.sales_bill_customer_advance_allocations.deleteMany({ where: { sales_bill_id: { in: salesBillIds } } })
    await prisma.sales_bill_po_sell_allocations.deleteMany({ where: { sales_bill_id: { in: salesBillIds } } })
    await prisma.sales_bill_source_allocations.deleteMany({ where: { sales_bill_id: { in: salesBillIds } } })
    await prisma.sales_bill_lines.deleteMany({ where: { sales_bill_id: { in: salesBillIds } } })
    await prisma.sales_bill_status_logs.deleteMany({ where: { sales_bill_id: { in: salesBillIds } } })
    await prisma.sales_bills.deleteMany({ where: { id: { in: salesBillIds } } })
  }
  await prisma.po_sells.deleteMany({ where: { doc_no: { startsWith: qaPrefix } } })
  await prisma.weight_tickets.deleteMany({ where: { doc_no: { startsWith: qaPrefix } } })
  await prisma.sales_channels.deleteMany({ where: { code: { startsWith: qaPrefix } } })
  await prisma.warehouses.deleteMany({ where: { code: { startsWith: qaPrefix } } })
  await prisma.customers.deleteMany({ where: { code: { startsWith: qaPrefix } } })
  await prisma.products.deleteMany({ where: { code: { startsWith: qaPrefix } } })
  await prisma.branches.deleteMany({ where: { code: { startsWith: qaPrefix } } })
}

async function main() {
  const [{ prisma }, { getSalesBillDetail }] = await Promise.all([
    import('../src/lib/server/prisma'),
    import('../src/lib/server/sales-bill-detail'),
  ])

  let assertions = 0
  await cleanup(prisma)
  try {
    const today = new Date('2026-06-14T00:00:00.000Z')
    const branch = await prisma.branches.create({
      data: { code: `${qaPrefix}-BR`, name: `${qaPrefix} Branch` },
    })
    const warehouse = await prisma.warehouses.create({
      data: { branch_id: branch.id, code: `${qaPrefix}-RM`, name: `${qaPrefix} RM`, type: 'RM' },
    })
    const customer = await prisma.customers.create({
      data: { code: `${qaPrefix}-CU`, name: `${qaPrefix} Customer` },
    })
    const product = await prisma.products.create({
      data: { code: `${qaPrefix}-P1`, name: `${qaPrefix} Product 1`, unit: 'กก.' },
    })
    const channel = await prisma.sales_channels.create({
      data: { code: `${qaPrefix}-CH`, name: `${qaPrefix} Channel` },
    })
    const ticket = await prisma.weight_tickets.create({
      data: {
        branch_id: branch.id,
        customer_id: customer.id,
        deduct_weight: 5,
        doc_no: `${qaPrefix}-WTO`,
        doc_type: 'WTO',
        document_date: today,
        gross_weight: 105,
        net_weight: 100,
        party_name: customer.name,
        status: 'delivered',
        vehicle_no: `${qaPrefix}-TRUCK`,
      },
    })
    const poSell = await prisma.po_sells.create({
      data: {
        branch_id: branch.id,
        customer_id: customer.id,
        date: today,
        doc_no: `${qaPrefix}-POS`,
        product_id: product.id,
        qty: 100,
        remaining_amount: 0,
        remaining_qty: 0,
        status: 'Completed',
        total_amount: 2000,
        unit_price: 20,
        warehouse_id: warehouse.id,
      },
    })
    const bill = await prisma.sales_bills.create({
      data: {
        branch_id: branch.id,
        channel_id: channel.id,
        customer_id: customer.id,
        date: today,
        doc_no: `${qaPrefix}-SB`,
        items: [
          {
            amount: 999,
            deliveryTicketDocNo: 'STALE-WTO',
            poSellId: 'STALE-POS',
            productCode: 'STALE-P',
            productId: 'STALE-P',
            productName: 'STALE PRODUCT',
            qty: 999,
            unitPrice: 99,
          },
        ],
        receivable_balance: 2000,
        status: 'unreceived',
        subtotal: 2000,
        total_amount: 2000,
        transaction_mode: 'STOCK',
        warehouse_id: warehouse.id,
      },
    })
    const line = await prisma.sales_bill_lines.create({
      data: {
        deduct_weight: 5,
        discount_amount: 0,
        gross_weight: 105,
        line_amount: 2000,
        line_no: 1,
        net_weight: 100,
        product_code_snapshot: product.code,
        product_id: product.id,
        product_name_snapshot: product.name,
        qty: 100,
        sales_bill_id: bill.id,
        status: 'active',
        unit_price: 20,
        unit_snapshot: 'กก.',
      },
    })
    await prisma.sales_bill_source_allocations.create({
      data: {
        allocated_deduct_weight: 5,
        allocated_gross_weight: 105,
        allocated_net_weight: 100,
        allocated_qty: 100,
        movement_owner: 'SALES_BILL',
        product_code_snapshot: product.code,
        product_id: product.id,
        product_name_snapshot: product.name,
        sales_bill_id: bill.id,
        sales_bill_line_id: line.id,
        sales_line_no: 1,
        source_doc_no: ticket.doc_no,
        source_id: ticket.id,
        source_line_no: 1,
        source_type: 'WTO',
        status: 'active',
        stock_ledger_ref_type: 'SB',
        weight_ticket_id: ticket.id,
      },
    })
    await prisma.sales_bill_po_sell_allocations.create({
      data: {
        allocated_amount: 2000,
        allocated_qty: 100,
        allocation_type: 'PO_SELL',
        po_sell_doc_no: poSell.doc_no,
        po_sell_id: poSell.id,
        product_code_snapshot: product.code,
        product_id: product.id,
        product_name_snapshot: product.name,
        sales_bill_id: bill.id,
        sales_bill_line_id: line.id,
        sales_line_no: 1,
        status: 'active',
        unit_price: 20,
      },
    })

    const detail = await getSalesBillDetail(bill.doc_no)
    if (!detail) throw new Error('detail not found')
    assertEqual('detail item count from facts', detail.items.length, 1)
    assertEqual('detail product from line fact', detail.items[0]?.productCode, product.code)
    assertEqual('detail delivery source from source facts', detail.items[0]?.deliveryTicketDocNo, ticket.doc_no)
    assertEqual('detail source label from po facts', detail.items[0]?.sourceLabel, `PO Sell ${poSell.doc_no}`)
    assertEqual('detail source type from facts', detail.items[0]?.sourceType, 'WTO stock-out source / PO Sell')
    assertEqual('detail delivery docs from source fact', detail.deliveryDocNos.join(','), ticket.doc_no)
    assertEqual('detail vehicle from source fact relation', detail.items[0]?.deliveryVehicleNo, ticket.vehicle_no)
    assertNear('detail qty from line fact', detail.items[0]?.qty ?? 0, 100)
    assertNear('detail amount from line fact', detail.items[0]?.amount ?? 0, 2000)
    assertEqual('detail read model warning is empty for durable facts', detail.readModelWarning, '')
    assertions += 10

    await prisma.sales_bills.update({
      data: { status: 'cancelled' },
      where: { id: bill.id },
    })
    await prisma.sales_bill_lines.updateMany({
      data: { status: 'cancelled' },
      where: { sales_bill_id: bill.id },
    })
    await prisma.sales_bill_source_allocations.updateMany({
      data: { status: 'cancelled' },
      where: { sales_bill_id: bill.id },
    })
    await prisma.sales_bill_po_sell_allocations.updateMany({
      data: { status: 'cancelled' },
      where: { sales_bill_id: bill.id },
    })

    const cancelledDetail = await getSalesBillDetail(bill.doc_no)
    if (!cancelledDetail) throw new Error('cancelled detail not found')
    assertEqual('cancelled detail still reads cancelled line facts', cancelledDetail.items[0]?.productCode, product.code)
    assertEqual('cancelled source label still from cancelled po facts', cancelledDetail.items[0]?.sourceLabel, `PO Sell ${poSell.doc_no}`)
    assertions += 2
  } finally {
    await cleanup(prisma)
    const residual = await prisma.sales_bills.count({ where: { doc_no: { startsWith: qaPrefix } } })
    assertEqual('fixture cleanup', residual, 0)
    assertions += 1
    await prisma.$disconnect()
  }

  console.log(JSON.stringify({
    assertions,
    cleanupPrefix: qaPrefix,
    status: 'ok',
  }, null, 2))
}

main().catch((caught) => {
  console.error(caught)
  process.exit(1)
})
