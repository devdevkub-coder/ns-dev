import { describe, expect, it } from 'vitest'
import type { CompanyProfilePrintValues } from './company-profile'
import { buildAdvancePaymentPrintHtml, type AdvancePaymentPrintDocument } from './advance-payment-print'
import { buildExpensePrintHtml } from './expense-print'
import { buildPmaSummaryPrintHtml } from './payment-approval-print'
import { buildPoBuyPrintHtml, type PoBuyPrintDocument } from './po-buy-print'
import { buildPoSellPrintHtml, type PoSellPrintDocument } from './po-sell-print'
import { buildSalesBillPrintHtml } from './sales-bill-print'
import type { SalesBillDetail } from './server/sales-bill-detail'

const profile: CompanyProfilePrintValues = {
  address: '99 ถนนทดสอบ กรุงเทพฯ',
  bankInfo: null,
  branchCode: '00000',
  email: 'accounting@example.com',
  fax: null,
  footerNote: 'เอกสารพิมพ์จากระบบ ERP',
  logoUrl: null,
  name: 'บริษัท เอ็นเอส สแครป จำกัด',
  nameEn: 'NS Scrap Co., Ltd.',
  phone: '021234567',
  taxId: '0105559999999',
  website: null,
}

const PRINT_BOUNDARIES = [
  { count: 0, pages: 1 },
  { count: 1, pages: 1 },
  { count: 15, pages: 1 },
  { count: 16, pages: 2 },
  { count: 30, pages: 2 },
  { count: 31, pages: 3 },
  { count: 46, pages: 4 },
] as const

function standardPages(html: string) {
  return [...html.matchAll(/<main class="page[^"]*" data-print-page="\d+"[\s\S]*?<\/main>/g)].map((match) => match[0])
}

function expectStandardPrintContract(html: string, expectedPages: number, expectedItemCount: number, continuationTitles: readonly string[]) {
  const pages = standardPages(html)

  expect(pages).toHaveLength(expectedPages)
  pages.forEach((page, index) => {
    expect(page.match(/data-row-slot/g)).toHaveLength(15)
    expect(page).toContain(`หน้า ${index + 1} / ${expectedPages}`)
    if (index < expectedPages - 1) {
      expect(page).toContain('data-final-page="false"')
      expect(page).toContain('data-page-totals="placeholder"')
      const placeholderFooter = page.match(/<tfoot[^>]*data-page-totals="placeholder"[\s\S]*?<\/tfoot>/)?.[0]
      expect(placeholderFooter).toContain('&nbsp;')
      expect(placeholderFooter).not.toMatch(/>\s*-\s*</)
      expect(page).toContain('data-continuation-summary="placeholder"')
      expect(page.match(/class="continuation-summary-panel"/g)).toHaveLength(2)
      expect(page.match(/class="continuation-placeholder"/g)).toHaveLength(2)
      continuationTitles.forEach((title) => {
        expect(page).toContain(`<div class="continuation-panel-title">${title}</div>`)
      })
      expect(page).toContain('data-continuation-signature="true"')
      expect(page).toContain(`Continued on Page ${index + 2}`)
      expect(page).not.toContain('data-signatures="final"')
    } else {
      expect(page).toContain('data-final-page="true"')
      expect(page).toContain('data-page-totals="final"')
      expect(page).toContain('data-signatures="final"')
      expect(page).not.toContain('Continued on Page')
    }
  })
  expect([...html.matchAll(/data-row-slot="(\d+)"/g)].map((match) => Number(match[1]))).toEqual(
    Array.from({ length: expectedItemCount }, (_, index) => index + 1),
  )
  expect(html).toMatch(/body\s*\{[^}]*background:\s*#334155/)
  expect(html).toMatch(/(?:\.items|\.summary-table)\s+(?:th|td)\s*\{[^}]*overflow-wrap:\s*anywhere[^}]*word-break:\s*break-word/)
  expect(html).toMatch(/\.page\s*\{[^}]*box-shadow:/)
  expect(html).toMatch(/@media print\s*\{[\s\S]*?body\s*\{[^}]*background:\s*(?:white|#fff)/)
  expect(html).toMatch(/@media print\s*\{[\s\S]*?\.page\s*\{[^}]*box-shadow:\s*none/)
}

function expectSingleLineCompanyHeader(html: string) {
  expect(html).toContain('<div class="company-name">บริษัท เอ็นเอส สแครป จำกัด (สำนักงานใหญ่)</div>')
  expect(html).not.toContain('จำกัด\n(สำนักงานใหญ่)')
  expect(html).toMatch(/\.company-name\s*\{[^}]*white-space:\s*nowrap/)
}

function makeSalesBill(itemCount: number): SalesBillDetail {
  return {
    billDate: '2026-08-07',
    branchId: '01',
    branchName: 'สำนักงานใหญ่',
    channelName: 'ขายหน้าร้าน',
    createdBy: 'ผู้ทดสอบ',
    customerAddress: 'กรุงเทพฯ',
    customerAdvanceAmount: 100,
    customerAdvanceDocNo: 'CADV-001',
    customerCode: 'CUS-001',
    customerName: 'ลูกค้าทดสอบ',
    customerTaxId: '0105558888888',
    date: '2026-08-07',
    deliveryDocNos: ['WTO-001'],
    discount: 10,
    docNo: 'SB-001',
    dueDate: '2026-08-14',
    exportOrderNo: '',
    hasVat: true,
    items: Array.from({ length: itemCount }, (_, index) => ({
      amount: 100,
      deliveryLineId: `delivery-line-${index + 1}`,
      deliverySummaryId: `delivery-summary-${index + 1}`,
      deliveryTicketDocNo: 'WTO-001',
      deliveryVehicleNo: '1กก 1234',
      deductWeight: 0,
      discount: 0,
      grossWeight: 10,
      lineNo: index + 1,
      matchedCogs: 0,
      netWeight: 10,
      note: '',
      poSellDocNo: '',
      price: 10,
      productCode: `P-${index + 1}`,
      productId: `product-${index + 1}`,
      productName: `สินค้า ${index + 1}`,
      qty: 10,
      salesDisplayProductCode: `P-${index + 1}`,
      sourceDeductWeight: 0,
      sourceGrossWeight: 10,
      sourceLineCount: 1,
      sourceNetWeight: 10,
      sourceProductCode: `P-${index + 1}`,
      sourceProductName: `สินค้า ${index + 1}`,
      sourceLabel: 'Spot Sale',
      sourceType: 'SPOT_SALE',
      tradingSourceDocNo: '',
      tradingSourceLineNo: null,
      unit: 'กก.',
      unitCostSnapshot: null,
    })),
    note: 'หมายเหตุทดสอบ',
    paidAmount: 0,
    readModelWarning: '',
    receivableBalance: 3_207,
    receivedAmount: 0,
    salesName: 'ฝ่ายขาย',
    sourceUsageFacts: [],
    status: 'active',
    statusLabel: 'ใช้งาน',
    stockReturnOptions: [],
    subtotal: itemCount * 100,
    timeline: [],
    totalAmount: itemCount * 100 * 1.07,
    transactionMode: 'STOCK',
    vatAmount: itemCount * 7,
    vatInvoiceDate: '',
    vatInvoiceIssued: false,
    vatInvoiceNo: '',
    vatType: 'EXCLUDE',
    warehouseName: 'คลังหลัก',
  }
}

function makePoBuy(itemCount: number): PoBuyPrintDocument {
  return {
    branchId: '01',
    branchName: 'สำนักงานใหญ่',
    createdAt: '2026-08-07T08:00:00.000Z',
    createdBy: 'ผู้ทดสอบ',
    date: '2026-08-07',
    docNo: 'POB-001',
    expectedDelivery: '2026-08-14',
    hasVat: true,
    id: 'po-buy-1',
    items: Array.from({ length: itemCount }, (_, index) => ({
      productId: `P-${index + 1}`,
      productName: `สินค้า ${index + 1}`,
      qty: 10,
      remainingQty: 10,
      unit: 'กก.',
      unitPrice: 10,
    })),
    notes: 'หมายเหตุทดสอบ',
    remainingAmount: itemCount * 100,
    remainingQty: itemCount * 10,
    shortClosedAt: '',
    shortClosedBy: '',
    shortClosedNote: '',
    shortClosedQty: 0,
    status: 'open',
    supplierAddress: 'กรุงเทพฯ',
    supplierId: 'SUP-001',
    supplierName: 'ผู้ขายทดสอบ',
    totalAmount: itemCount * 107,
    vatAmount: itemCount * 7,
    vatRatePercent: 7,
    vatType: 'EXCLUDE',
  }
}

function makePoSell(itemCount: number): PoSellPrintDocument {
  return {
    branchId: '01',
    branchName: 'สำนักงานใหญ่',
    channelName: 'ขายหน้าร้าน',
    createdAt: '2026-08-07T08:00:00.000Z',
    createdBy: 'ผู้ทดสอบ',
    customerAddress: 'กรุงเทพฯ',
    customerId: 'CUS-001',
    customerName: 'ลูกค้าทดสอบ',
    customerPhone: '0812345678',
    customerTaxId: '0105558888888',
    docNo: 'POS-001',
    documentStatus: 'open',
    expectedDelivery: '2026-08-14',
    hasVat: true,
    id: 'po-sell-1',
    items: Array.from({ length: itemCount }, (_, index) => ({
      discount: 0,
      note: null,
      price: 10,
      productId: `P-${index + 1}`,
      productName: `สินค้า ${index + 1}`,
      qty: 10,
      remainingQty: 10,
      totalAmount: 100,
      unit: 'กก.',
      unitPrice: 10,
    })),
    note: 'หมายเหตุทดสอบ',
    remainingAmount: itemCount * 100,
    remainingQty: itemCount * 10,
    status: 'open',
    subtotal: itemCount * 100,
    totalAmount: itemCount * 107,
    vatAmount: itemCount * 7,
    vatRatePercent: 7,
    vatType: 'EXCLUDE',
  }
}

function makeAdvancePayment(allocationCount: number): AdvancePaymentPrintDocument {
  return {
    accountName: 'เงินสด',
    advanceDate: '2026-08-07',
    advanceTypeLabel: 'มัดจำส่งของรอคัดแยก',
    allocatedAmount: allocationCount * 100,
    allocations: Array.from({ length: allocationCount }, (_, index) => ({
      allocatedAmount: 100,
      allocatedAt: '2026-08-07T08:00:00.000Z',
      allocatedBy: 'ผู้ทดสอบ',
      id: `allocation-${index + 1}`,
      purchaseBillDocNo: `PB-${index + 1}`,
    })),
    amount: 5_000,
    branchId: '01',
    branchName: 'สำนักงานใหญ่',
    createdAt: '2026-08-07T08:00:00.000Z',
    createdBy: 'ผู้ทดสอบ',
    docNo: 'ADV-001',
    id: 'advance-1',
    invoiceNo: '',
    netWeight: 100,
    paymentMethod: 'เงินสด',
    plateNo: '1กก 1234',
    pricePerKg: 50,
    productName: 'สินค้าทดสอบ',
    remainingAmount: 5_000 - allocationCount * 100,
    remark: 'หมายเหตุทดสอบ',
    subtotalAmount: 5_000,
    supplierName: 'ผู้ขายทดสอบ',
    totalAmount: 5_350,
    vatAmount: 350,
    vatRatePercent: 7,
    vatTypeLabel: 'VAT',
  }
}

function makeExpense(lineCount: number) {
  return {
    accountName: 'เงินสด',
    amount: lineCount * 100,
    branchName: 'สำนักงานใหญ่',
    date: '2026-08-07',
    description: 'รายละเอียดรวม',
    docNo: 'EXP-001',
    lines: Array.from({ length: lineCount }, (_, index) => ({
      amount: 100,
      categoryName: `หมวดค่าใช้จ่าย ${index + 1}`,
      description: `รายการ ${index + 1}`,
      vatAmount: 7,
      whtAmount: 3,
    })),
    netAmount: lineCount * 104,
    notes: 'หมายเหตุทดสอบ',
    payee: 'ผู้รับเงินทดสอบ',
    status: 'paid',
    vat: lineCount * 7,
    wht: lineCount * 3,
  }
}

function makePmaRows(rowCount: number) {
  return Array.from({ length: rowCount }, (_, index) => ({
    approvalDisplayDocNo: `PMA-${index + 1}`,
    approvalId: `approval-${index + 1}`,
    approvalStatus: 'approved' as const,
    approvedAmount: 100,
    date: '2026-08-07',
    destinationLabel: `บัญชีปลายทาง ${index + 1}`,
    docNo: `PMA-${index + 1}`,
    id: `approval-${index + 1}`,
    sourceDocNo: `PB-${index + 1}`,
    sourceType: 'purchase_bill' as const,
    supplierName: `ผู้ขาย ${index + 1}`,
    totalAmount: 100,
  }))
}

describe.each([
  { build: (count: number, selectedProfile = profile) => buildSalesBillPrintHtml(makeSalesBill(count), selectedProfile), continuationTitles: ['สรุปตามหมวดสินค้า', 'หมายเหตุ'], name: 'sales bill' },
  { build: (count: number, selectedProfile = profile) => buildPoBuyPrintHtml(makePoBuy(count), selectedProfile), continuationTitles: ['สรุปตามหมวดสินค้า', 'หมายเหตุ'], name: 'PO Buy' },
  { build: (count: number, selectedProfile = profile) => buildPoSellPrintHtml(makePoSell(count), selectedProfile), continuationTitles: ['สรุปตามหมวดสินค้า', 'หมายเหตุ'], name: 'PO Sell' },
  { build: (count: number, selectedProfile = profile) => buildAdvancePaymentPrintHtml(makeAdvancePayment(count), selectedProfile), continuationTitles: ['สรุปการจัดสรร', 'หมายเหตุ'], name: 'advance allocation history' },
  { build: (count: number, selectedProfile = profile) => buildExpensePrintHtml(makeExpense(count), selectedProfile), continuationTitles: ['สรุปค่าใช้จ่าย', 'หมายเหตุ'], name: 'expense voucher' },
  { build: (count: number, selectedProfile = profile) => buildPmaSummaryPrintHtml(makePmaRows(count), selectedProfile, 'เจ้าหนี้การค้า'), continuationTitles: ['สรุปการอนุมัติจ่าย', 'หมายเหตุ'], name: 'payment approval' },
])('$name print pagination', ({ build, continuationTitles }) => {
  it.each(PRINT_BOUNDARIES)('renders $count items across $pages page(s)', ({ count, pages }) => {
    expectStandardPrintContract(build(count), pages, count, continuationTitles)
  })

  it('keeps the legal company name on one line', () => {
    expectSingleLineCompanyHeader(build(1, {
      ...profile,
      name: 'บริษัท เอ็นเอส สแครป จำกัด\n(สำนักงานใหญ่)',
    }))
  })
})

describe('document-specific print preservation', () => {
  it('uses bundled Thai fonts for PMA without an external network dependency', () => {
    const html = buildPmaSummaryPrintHtml(makePmaRows(1), profile, 'เจ้าหนี้การค้า')

    expect(html).not.toMatch(/@import\b/i)
    expect(html).not.toContain('fonts.googleapis.com')
    expect(html).toContain("url('/fonts/NotoSansThai-Regular.ttf')")
    expect(html).toContain("url('/fonts/NotoSansThai-Bold.ttf')")
  })

  it('counts a PMA group-total row toward the 15 physical table slots per page', () => {
    const rows = makePmaRows(15).map((row) => ({
      ...row,
      destinationLabel: 'บัญชีปลายทางเดียวกัน',
      supplierName: 'ผู้ขายรายเดียวกัน',
    }))
    const pages = standardPages(buildPmaSummaryPrintHtml(rows, profile, 'เจ้าหนี้การค้า'))

    expect(pages).toHaveLength(2)
    expect(pages[0].match(/data-row-slot/g)).toHaveLength(15)
    expect(pages[1].match(/data-row-slot/g)).toHaveLength(15)
    expect(pages.join('').match(/class="group-total"/g)).toHaveLength(1)
  })

  it('preserves the EXP cancellation watermark', () => {
    const html = buildExpensePrintHtml({ ...makeExpense(1), status: 'cancelled' }, profile)

    expect(html).toContain('CANCELLED')
    expect(html).toMatch(/\.watermark\s*\{\s*display:\s*block/)
  })
})
