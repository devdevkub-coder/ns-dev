import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function readSource(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8').replaceAll('\r\n', '\n')
}

const transactionBillsSource = readSource('./TransactionBillsPageClient.tsx')
const purchaseBillsSource = readSource('../purchase-flow/PurchaseBillsPageClient.tsx')
const receiptVouchersSource = readSource('./ReceiptVouchersPageClient.tsx')
const weightTicketDashboardSource = readSource('./WeightTicketDashboardPageClient.tsx')
const weightTicketListSource = readSource('./WeightTicketListPageClient.tsx')
const poSellSource = readSource('../sales/PoSellPageClient.tsx')
const advancePaymentsSource = readSource('../purchase-flow/AdvancePaymentsPageClient.tsx')
const resizableTableHeadSource = readSource('../ui/ResizableTableHead.tsx')
const salesBillsRouteSource = readSource('../../app/sales/bills/page.tsx')
const globalsSource = readSource('../../app/globals.css')

const TEXTUAL_COLUMN_CLASS = 'ns-table-textual-column'

function openingTag(source: string, tagName: string, marker: string) {
  const markerIndex = source.indexOf(marker)
  expect(markerIndex, `missing marker: ${marker}`).toBeGreaterThan(-1)
  const tagStart = source.lastIndexOf(`<${tagName}`, markerIndex)
  const tagEnd = source.indexOf('>', markerIndex)
  expect(tagStart, `missing <${tagName}> for: ${marker}`).toBeGreaterThan(-1)
  expect(tagEnd, `missing closing > for: ${marker}`).toBeGreaterThan(tagStart)
  return source.slice(tagStart, tagEnd + 1)
}

function expectLeftAlignedColumn({
  bodyMarker,
  bodyTagName,
  defaultAlignmentSource,
  headerMarker,
  headerTagName,
  source,
}: {
  bodyMarker: string
  bodyTagName: 'TableCell' | 'td'
  defaultAlignmentSource?: string
  headerMarker: string
  headerTagName: 'AdvancePaymentSortHeader' | 'ResizableTableHead' | 'SortHeader'
  source: string
}) {
  const headerTag = openingTag(source, headerTagName, headerMarker)
  const bodyTag = openingTag(source, bodyTagName, bodyMarker)
  const textualColumnClassPattern = new RegExp(`className=(?:"[^"]*\\b${TEXTUAL_COLUMN_CLASS}\\b[^"]*"|\\{[^}]*['"][^'"]*\\b${TEXTUAL_COLUMN_CLASS}\\b[^'"]*['"][^}]*\\})`)

  expect(headerTag).toMatch(textualColumnClassPattern)
  expect(bodyTag).toMatch(textualColumnClassPattern)
  expect(headerTag).not.toMatch(/align="(?:center|right)"/)
  if (!headerTag.includes('align="left"')) {
    expect(defaultAlignmentSource).toContain("align = 'left'")
  }
  expect(bodyTag).not.toMatch(/(?:justify|text)-(?:center|end|right)/)
}

describe('transaction bill detail table', () => {
  it('shows the captured unit cost between net quantity and sale price', () => {
    const netQuantityHeader = transactionBillsSource.indexOf('>จำนวนสุทธิ</th>')
    const unitCostHeader = transactionBillsSource.indexOf('>ต้นทุน/หน่วย</th>')
    const salePriceHeader = transactionBillsSource.indexOf('>ราคาขาย/หน่วย</th>', netQuantityHeader)
    const detailTableStart = transactionBillsSource.lastIndexOf('<table', netQuantityHeader)
    const detailTableEnd = transactionBillsSource.indexOf('</table>', netQuantityHeader)
    const detailTableSource = transactionBillsSource.slice(detailTableStart, detailTableEnd)

    expect(netQuantityHeader).toBeGreaterThan(-1)
    expect(unitCostHeader).toBeGreaterThan(netQuantityHeader)
    expect(salePriceHeader).toBeGreaterThan(unitCostHeader)
    expect(detailTableStart).toBeGreaterThan(-1)
    expect(detailTableEnd).toBeGreaterThan(salePriceHeader)
    expect(detailTableSource).toContain("item.unitCostSnapshot == null ? '-' : formatMoney(item.unitCostSnapshot)")
    expect(detailTableSource).toContain('min-w-[1240px]')
    expect(detailTableSource).toContain('colSpan={10}>ไม่มีรายการสินค้าในบิล')
  })
})

describe('accepted textual table alignment', () => {
  it('centers headers, left-aligns text, and right-aligns explicitly numeric cells', () => {
    const headerSelector = 'table.ns-table > thead > tr > th:not([colspan])'
    const bodySelector = 'table.ns-table > :is(tbody, tfoot) > tr > :is(th, td):not([colspan])'
    const numericSelector = 'table.ns-table > :is(tbody, tfoot) > tr > :is(th, td):is(.text-right, .tabular-nums):not([colspan])'

    expect(globalsSource.slice(globalsSource.indexOf(headerSelector), globalsSource.indexOf('}', globalsSource.indexOf(headerSelector)))).toContain('text-align: center !important;')
    expect(globalsSource.slice(globalsSource.indexOf(bodySelector), globalsSource.indexOf('}', globalsSource.indexOf(bodySelector)))).toContain('text-align: left !important;')
    expect(globalsSource.slice(globalsSource.indexOf(numericSelector), globalsSource.indexOf('}', globalsSource.indexOf(numericSelector)))).toContain('text-align: right !important;')
  })

  it('centers purchase bill columns except money columns on /purchase/bills', () => {
    expect(purchaseBillsSource).toContain('<TransactionBillsPageClient mode="purchase" />')
    const supplierHeaderTag = openingTag(transactionBillsSource, 'SortHeader', "getResizeHandleProps('partyName', mode === 'purchase' ? 'ผู้ขาย' : 'ลูกค้า')")
    const supplierBodyTag = openingTag(transactionBillsSource, 'td', "'supplierName' in row ? row.supplierName : row.customerName")
    const totalHeaderTag = openingTag(transactionBillsSource, 'SortHeader', 'sortKey="totalAmount"')
    const outstandingHeaderTag = openingTag(transactionBillsSource, 'SortHeader', 'sortKey="outstanding"')
    const actionHeaderTag = openingTag(transactionBillsSource, 'ResizableTableHead', "getResizeHandleProps('action', 'จัดการ')")

    expect(supplierHeaderTag).toContain('align="center"')
    expect(supplierHeaderTag).not.toContain(TEXTUAL_COLUMN_CLASS)
    expect(supplierBodyTag).toContain('text-center')
    expect(supplierBodyTag).not.toContain(TEXTUAL_COLUMN_CLASS)
    expect(totalHeaderTag).toContain('align="right"')
    expect(totalHeaderTag).toContain('className="ns-table-numeric-header"')
    expect(outstandingHeaderTag).toContain('align="right"')
    expect(outstandingHeaderTag).toContain('className="ns-table-numeric-header"')
    expect(actionHeaderTag).toContain('align="center"')
    expect(transactionBillsSource).toContain('<td className="p-2 text-center">\n                    <TableActionButton menu={(')
  })

  it('centers sales bill non-numeric columns and right-aligns numeric columns on /sales/bills', () => {
    expect(salesBillsRouteSource).toContain('<TransactionBillsPageClient mode="sales" />')
    const customerHeaderTag = openingTag(transactionBillsSource, 'SortHeader', "getResizeHandleProps('partyName', mode === 'purchase' ? 'ผู้ขาย' : 'ลูกค้า')")
    const customerBodyTag = openingTag(transactionBillsSource, 'td', "'supplierName' in row ? row.supplierName : row.customerName")
    const itemCountHeaderTag = openingTag(transactionBillsSource, 'SortHeader', 'sortKey="itemCount"')
    const totalHeaderTag = openingTag(transactionBillsSource, 'SortHeader', 'sortKey="totalAmount"')
    const gpHeaderTag = openingTag(transactionBillsSource, 'ResizableTableHead', "getResizeHandleProps('gp', 'GP / Margin')")
    const paidHeaderTag = openingTag(transactionBillsSource, 'ResizableTableHead', "getResizeHandleProps('paidAmount', 'รับแล้ว')")
    const outstandingHeaderTag = openingTag(transactionBillsSource, 'SortHeader', 'sortKey="outstanding"')
    const actionHeaderTag = openingTag(transactionBillsSource, 'ResizableTableHead', "getResizeHandleProps('action', 'จัดการ')")

    expect(customerHeaderTag).toContain('align="center"')
    expect(customerHeaderTag).not.toContain(TEXTUAL_COLUMN_CLASS)
    expect(customerBodyTag).toContain('text-center')
    expect(customerBodyTag).not.toContain(TEXTUAL_COLUMN_CLASS)
    for (const headerTag of [itemCountHeaderTag, totalHeaderTag, gpHeaderTag, paidHeaderTag, outstandingHeaderTag]) {
      expect(headerTag).toContain('align="right"')
      expect(headerTag).toContain('className="ns-table-numeric-header"')
    }
    expect(actionHeaderTag).toContain('align="center"')
  })

  it('left-aligns the payee column on /purchase/receipt-vouchers', () => {
    expectLeftAlignedColumn({
      bodyMarker: ">{row.sellerName || '-'}</td>",
      bodyTagName: 'td',
      defaultAlignmentSource: resizableTableHeadSource,
      headerMarker: "getResizeHandleProps('sellerName', 'ผู้รับเงิน')",
      headerTagName: 'ResizableTableHead',
      source: receiptVouchersSource,
    })
  })

  it('left-aligns the WTO party column on /daily/weight-ticket-dashboard', () => {
    expectLeftAlignedColumn({
      bodyMarker: 'title={row.partyName}>{row.partyName}</div>',
      bodyTagName: 'td',
      defaultAlignmentSource: resizableTableHeadSource,
      headerMarker: "getResizeHandleProps('party', 'คู่ค้า')",
      headerTagName: 'ResizableTableHead',
      source: weightTicketDashboardSource,
    })
  })

  it('left-aligns the created date and Supplier columns on /daily/weight-ticket-list', () => {
    expectLeftAlignedColumn({
      bodyMarker: '{ticketDate}</div>',
      bodyTagName: 'td',
      headerMarker: "getResizeHandleProps('createdAt', 'วันที่สร้าง')",
      headerTagName: 'SortHeader',
      source: weightTicketListSource,
    })
    expectLeftAlignedColumn({
      bodyMarker: '>{ticket.partyName}</td>',
      bodyTagName: 'td',
      headerMarker: "getResizeHandleProps('partyName', typeFilter === 'WTI' ? 'ผู้ขาย' : 'ลูกค้า')",
      headerTagName: 'SortHeader',
      source: weightTicketListSource,
    })
  })

  it('left-aligns the Customer column on /sales/po-sell', () => {
    expectLeftAlignedColumn({
      bodyMarker: '>{row.customerName}</TableCell>',
      bodyTagName: 'TableCell',
      defaultAlignmentSource: resizableTableHeadSource,
      headerMarker: "getResizeHandleProps('customerName', 'ลูกค้า')",
      headerTagName: 'ResizableTableHead',
      source: poSellSource,
    })
  })

  it('left-aligns the Supplier column on /purchase/advance-payments', () => {
    expectLeftAlignedColumn({
      bodyMarker: '>{row.supplierName}</td>',
      bodyTagName: 'td',
      defaultAlignmentSource: advancePaymentsSource,
      headerMarker: "getResizeHandleProps('supplierName', 'ผู้ขาย')",
      headerTagName: 'AdvancePaymentSortHeader',
      source: advancePaymentsSource,
    })
  })

  it('does not opt the WTI dashboard or WTO list into textual alignment', () => {
    const wtiPanelTag = openingTag(weightTicketDashboardSource, 'FlowTablePanel', 'storageKey="daily.weight-ticket-dashboard.wti.v1"')
    const wtoPanelTag = openingTag(weightTicketDashboardSource, 'FlowTablePanel', 'storageKey="daily.weight-ticket-dashboard.wto.v1"')
    const dashboardHeaderTag = openingTag(weightTicketDashboardSource, 'ResizableTableHead', "getResizeHandleProps('party',")
    const dashboardBodyTag = openingTag(weightTicketDashboardSource, 'td', 'title={row.partyName}>{row.partyName}</div>')
    const listCreatedHeaderTag = openingTag(weightTicketListSource, 'SortHeader', 'sortKey="createdAt"')
    const listPartyHeaderTag = openingTag(weightTicketListSource, 'SortHeader', 'sortKey="partyName"')
    const listCreatedBodyTag = openingTag(weightTicketListSource, 'td', '{ticketDate}</div>')
    const listPartyBodyTag = openingTag(weightTicketListSource, 'td', '>{ticket.partyName}</td>')
    const dashboardConditionalClass = `leftAlignParty ? '${TEXTUAL_COLUMN_CLASS}`
    const listConditionalClass = `typeFilter === 'WTI' ? '${TEXTUAL_COLUMN_CLASS}`

    expect(wtiPanelTag).not.toContain('leftAlignParty')
    expect(wtoPanelTag).toContain('leftAlignParty')
    expect(dashboardHeaderTag).toContain(dashboardConditionalClass)
    expect(dashboardBodyTag).toContain(dashboardConditionalClass)
    for (const tag of [listCreatedHeaderTag, listPartyHeaderTag, listCreatedBodyTag, listPartyBodyTag]) {
      expect(tag).toContain(listConditionalClass)
      expect(tag).not.toContain(`className="${TEXTUAL_COLUMN_CLASS}"`)
    }
  })
})
