import { describe, expect, it } from 'vitest'
import type { CompanyProfilePrintValues } from './company-profile'
import { buildAdvancePaymentPrintHtml, type AdvancePaymentPrintDocument } from './advance-payment-print'
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

function expectStandardPrintContract(html: string, expectedPages: number, expectedItemCount: number) {
  const pages = standardPages(html)

  expect(pages).toHaveLength(expectedPages)
  pages.forEach((page, index) => {
    expect(page.match(/data-row-slot/g)).toHaveLength(15)
    expect(page).toContain(`หน้า ${index + 1} / ${expectedPages}`)
    if (index < expectedPages - 1) {
      expect(page).toContain('data-final-page="false"')
      expect(page).toContain('data-page-totals="placeholder"')
      expect(page).toMatch(/data-page-totals="placeholder"[\s\S]*?>-\s*</)
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
  expect(html).toMatch(/\.page\s*\{[^}]*box-shadow:/)
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

describe.each([
  { build: (count: number) => buildSalesBillPrintHtml(makeSalesBill(count), profile), name: 'sales bill' },
  { build: (count: number) => buildPoBuyPrintHtml(makePoBuy(count), profile), name: 'PO Buy' },
  { build: (count: number) => buildPoSellPrintHtml(makePoSell(count), profile), name: 'PO Sell' },
  { build: (count: number) => buildAdvancePaymentPrintHtml(makeAdvancePayment(count), profile), name: 'advance allocation history' },
])('$name print pagination', ({ build }) => {
  it.each(PRINT_BOUNDARIES)('renders $count items across $pages page(s)', ({ count, pages }) => {
    expectStandardPrintContract(build(count), pages, count)
  })
})
