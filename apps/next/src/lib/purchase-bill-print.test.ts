import { describe, expect, it } from 'vitest'
import type { CompanyProfilePrintValues } from './company-profile'
import { buildPurchaseBillPrintHtml } from './purchase-bill-print'
import type { PurchaseBillDetail } from './server/purchase-bill-detail'

const profile: CompanyProfilePrintValues = {
  address: '99 ถนนทดสอบ กรุงเทพฯ',
  bankInfo: null,
  branchCode: '00000',
  email: 'accounting@example.com',
  fax: null,
  footerNote: 'ขอบคุณที่ใช้บริการ',
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

function makeBill(overrides: Partial<PurchaseBillDetail> = {}, allocationCount = 31): PurchaseBillDetail {
  return {
    advanceAllocatedAmount: 107,
    advanceAllocatedSubtotalAmount: 100,
    advanceAllocatedVatAmount: 7,
    advanceConsumedAmount: 100,
    advancePaymentDocNo: 'ADV012607-0001',
    advancePaymentInvoiceNo: 'INV-ADV-001',
    advancePaymentVatType: 'EXCLUDE',
    advancePaymentVatTypeLabel: 'ไม่รวม VAT',
    allocationRows: Array.from({ length: allocationCount }, (_, index) => ({
      amount: 100,
      deductWeight: 1,
      grossWeight: 11,
      lineId: `line-${index + 1}`,
      lineNo: index + 1,
      note: `หมายเหตุรายการ ${index + 1}`,
      poDocNo: index === 0 ? 'POB012607-0001' : null,
      price: 10,
      productCode: `P-${index + 1}`,
      productId: `product-${index + 1}`,
      productName: `สินค้า ${index + 1}`,
      qty: 10,
      receiptSummaryLabel: `ใบรับของ ${index + 1}`,
      receiptTicketDocNo: `WTI012607-${String(index + 1).padStart(4, '0')}`,
      receiptVehicleNo: '1กก 1234',
      sourceLabel: index === 0 ? 'PO' : 'Spot Buy',
      sourceType: index === 0 ? 'PO' : 'SPOT_BUY',
      unit: 'กก.',
    })),
    branchId: 'branch-1',
    branchName: 'สำนักงานใหญ่',
    createdBy: 'เจ้าหน้าที่ทดสอบ',
    date: '19/07/2569',
    discount: 50,
    docNo: 'PB012607-0001',
    hasVat: true,
    licensePlate: '1กก 1234',
    note: 'หมายเหตุท้ายบิลสำหรับทดสอบ',
    paidAmount: 500,
    payableBalance: 2_667,
    productSummaries: [],
    receiptDocNos: ['WTI012607-0001'],
    refNo: '',
    salesName: 'ฝ่ายขายทดสอบ',
    status: 'cancelled',
    statusLabel: 'ยกเลิก',
    subtotal: 3_100,
    supplierAddress: '88 ถนนผู้ขาย กรุงเทพฯ',
    supplierBankAccounts: [],
    supplierCode: 'SUP-001',
    supplierName: 'ผู้ขายทดสอบ',
    supplierTaxId: '0105558888888',
    timeline: [],
    totalAmount: 3_263.5,
    transactionMode: 'STOCK',
    vatAmount: 213.5,
    vatInvoiceDate: '',
    vatInvoiceNo: '',
    vatInvoiceReceived: false,
    vatRatePercent: 7,
    vatType: 'EXCLUDE',
    warehouseName: 'คลังวัตถุดิบ',
    ...overrides,
  }
}

describe('purchase bill print', () => {
  it.each(PRINT_BOUNDARIES)('renders $count rows across $pages page(s)', ({ count, pages: expectedPages }) => {
    const html = buildPurchaseBillPrintHtml(makeBill({}, count), profile)
    const pages = [...html.matchAll(/<main class="page[^"]*" data-print-page="\d+"[\s\S]*?<\/main>/g)].map((match) => match[0])

    expect(pages).toHaveLength(expectedPages)
    pages.forEach((page, index) => {
      expect(page.match(/data-row-slot/g)).toHaveLength(15)
      expect(page).toContain(`หน้า ${index + 1} / ${expectedPages}`)
      if (index < expectedPages - 1) {
        expect(page).toContain('data-page-totals="placeholder"')
        const placeholderFooter = page.match(/<tfoot[^>]*data-page-totals="placeholder"[\s\S]*?<\/tfoot>/)?.[0]
        expect(placeholderFooter).toContain('&nbsp;')
        expect(placeholderFooter).not.toMatch(/>\s*-\s*</)
        expect(page).toContain('data-continuation-summary="empty"')
        expect(page.match(/class="continuation-empty-panel"/g)).toHaveLength(2)
        expect(page).toContain('data-continuation-signature="true"')
        expect(page).toContain(`Continued on Page ${index + 2}`)
        expect(page).not.toContain('data-signatures="final"')
      } else {
        expect(page).toContain('data-page-totals="final"')
        expect(page).toContain('data-signatures="final"')
        expect(page).not.toContain('Continued on Page')
      }
    })
    expect([...html.matchAll(/data-row-slot="(\d+)"/g)].map((match) => Number(match[1]))).toEqual(
      Array.from({ length: count }, (_, index) => index + 1),
    )
  })

  it('keeps the legal company name on one line', () => {
    const html = buildPurchaseBillPrintHtml(makeBill({}, 1), {
      ...profile,
      name: 'บริษัท เอ็นเอส สแครป จำกัด\n(สำนักงานใหญ่)',
    })

    expect(html).toContain('<div class="company-name">บริษัท เอ็นเอส สแครป จำกัด (สำนักงานใหญ่)</div>')
    expect(html).not.toContain('จำกัด\n(สำนักงานใหญ่)')
    expect(html).toMatch(/\.company-name\s*\{[^}]*white-space:\s*nowrap/)
  })

  it('omits payment progress while preserving the complete purchase document', () => {
    const html = buildPurchaseBillPrintHtml(makeBill(), profile)

    expect(html).not.toContain('>ชำระแล้ว<')
    expect(html).not.toContain('>ค้างชำระ<')
    expect(html).toContain('ยอดสุทธิรวม VAT ที่ต้องจ่าย')
    expect(html).toContain('VAT 7%')
    expect(html).toContain('หัก ADV/มัดจำก่อน VAT (ADV012607-0001)')
    expect(html).toContain('หมายเหตุท้ายบิลสำหรับทดสอบ')
    expect(html).toContain('ผู้ส่งสินค้า / Supplier')
    expect(html).toContain('ผู้ตรวจรับ / ตรวจนับ')
    expect(html).toContain('ผู้รับสินค้า / บริษัท')
    expect(html).toContain('<div class="watermark">ยกเลิก</div>')
    expect(html).toContain('.watermark { display: block;')
    expect(html).toContain('สินค้า 31')
    expect(html).toContain('.items thead { display: table-header-group; }')
    expect(html).toContain('.items tr { break-inside: avoid; page-break-inside: avoid; }')
  })

  it('keeps the no-VAT net total wording without payment progress', () => {
    const html = buildPurchaseBillPrintHtml(makeBill({
      advanceAllocatedAmount: 0,
      advanceAllocatedSubtotalAmount: 0,
      advanceAllocatedVatAmount: 0,
      advanceConsumedAmount: 0,
      advancePaymentDocNo: '',
      hasVat: false,
      status: 'active',
      statusLabel: 'ใช้งาน',
      vatAmount: 0,
    }), profile)

    expect(html).not.toContain('>ชำระแล้ว<')
    expect(html).not.toContain('>ค้างชำระ<')
    expect(html).toContain('ยอดสุทธิที่ต้องจ่าย')
    expect(html).not.toContain('VAT 7%')
  })
})
