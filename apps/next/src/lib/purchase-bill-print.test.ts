import { describe, expect, it, vi } from 'vitest'
import type { CompanyProfilePrintValues } from './company-profile'
import { buildPurchaseBillPrintHtml, normalizePurchaseBillPrintText, normalizePurchaseBillPrintUnit, waitForPurchaseBillPrintAssets } from './purchase-bill-print'
import {
  paginatePurchaseBillPrintRows,
  parsePurchaseBillRemark,
  purchaseBillRowSegmentKey,
} from './purchase-bill-print-layout'
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
    editForm: {
      advancePaymentId: null,
      branchId: 'branch-1',
      discountTotal: 50,
      hasVat: true,
      items: [],
      note: 'หมายเหตุท้ายบิลสำหรับทดสอบ',
      notes: 'หมายเหตุท้ายบิลสำหรับทดสอบ',
      poBuyId: null,
      purchaseChannelId: null,
      purchaseSource: 'SPOT_BUY',
      receiptTicketId: null,
      refNo: null,
      salesId: null,
      supplierId: 'SUP-001',
      transactionMode: 'STOCK',
      vatInvoiceDate: null,
      vatInvoiceNo: null,
      vatInvoiceReceived: false,
      vatType: 'EXCLUDE',
      warehouseId: 'warehouse-1',
    },
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
    updatedAt: '2026-07-19T10:00:00.000Z',
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

function buildHtml(bill: PurchaseBillDetail, companyProfile = profile) {
  const segmentHeights: Record<string, number> = {}
  bill.allocationRows.forEach((row, sourceIndex) => {
    const remark = parsePurchaseBillRemark(row.note)
    if (remark.kind === 'plain') {
      segmentHeights[purchaseBillRowSegmentKey(sourceIndex, 0, 0)] = 40
      return
    }
    for (let start = 0; start < remark.items.length; start += 1) {
      for (let end = start + 1; end <= remark.items.length; end += 1) {
        segmentHeights[purchaseBillRowSegmentKey(sourceIndex, start, end)] = 24 + (end - start) * 18
      }
    }
  })
  const pagePlan = paginatePurchaseBillPrintRows(
    bill.allocationRows.map((row) => row.note),
    {
      continuationEndHeight: 150,
      emptyRowMinimumHeight: 18,
      finalEndHeight: 250,
      pageContentHeight: 1_000,
      segmentHeights,
      tableHeaderHeight: 50,
      topHeight: 100,
    },
  )
  return buildPurchaseBillPrintHtml(bill, companyProfile, { pagePlan })
}

describe('purchase bill print', () => {
  it.each(PRINT_BOUNDARIES)('renders $count rows across $pages page(s)', ({ count, pages: expectedPages }) => {
    const html = buildHtml(makeBill({}, count))
    const pages = [...html.matchAll(/<main class="page[^"]*" data-print-page="\d+"[\s\S]*?<\/main>/g)].map((match) => match[0])

    expect(pages).toHaveLength(expectedPages)
    pages.forEach((page, index) => {
      expect(page.match(/class="item-row/g)?.length ?? 0).toBeLessThanOrEqual(15)
      expect(page).toContain(`หน้า ${index + 1} / ${expectedPages}`)
      if (index < expectedPages - 1) {
        expect(page).toContain('data-page-totals="placeholder"')
        const placeholderFooter = page.match(/<tfoot[^>]*data-page-totals="placeholder"[\s\S]*?<\/tfoot>/)?.[0]
        expect(placeholderFooter).toContain('&nbsp;')
        expect(placeholderFooter).not.toMatch(/>\s*-\s*</)
        expect(page).toContain('data-continuation-summary="placeholder"')
        expect(page.match(/class="continuation-summary-panel"/g)).toHaveLength(2)
        expect(page.match(/class="continuation-placeholder"/g)).toHaveLength(2)
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
    const html = buildHtml(makeBill({}, 1), {
      ...profile,
      name: 'บริษัท เอ็นเอส สแครป จำกัด\n(สำนักงานใหญ่)',
    })

    expect(html).toContain('<div class="company-name">บริษัท เอ็นเอส สแครป จำกัด (สำนักงานใหญ่)</div>')
    expect(html).not.toContain('จำกัด\n(สำนักงานใหญ่)')
    expect(html).toMatch(/\.company-name\s*\{[^}]*white-space:\s*nowrap/)
  })

  it('uses the same A4 content box in preview and print', () => {
    const html = buildHtml(makeBill({}, 1))

    expect(html).toMatch(/\.page\s*\{[^}]*width:\s*210mm;[^}]*height:\s*297mm;[^}]*min-height:\s*297mm;[^}]*max-height:\s*297mm;[^}]*padding:\s*8mm;[^}]*overflow:\s*hidden;/)
    expect(html).toMatch(/@media print\s*\{[\s\S]*?body\s*\{[^}]*padding:\s*0;[\s\S]*?\.page\s*\{[^}]*width:\s*194mm;[^}]*height:\s*281mm;[^}]*min-height:\s*281mm;[^}]*max-height:\s*281mm;[^}]*padding:\s*0;[^}]*overflow:\s*hidden;[^}]*box-shadow:\s*none;/)
    expect(html).toMatch(/@media print\s*\{[\s\S]*?-webkit-print-color-adjust:\s*exact;[\s\S]*?print-color-adjust:\s*exact;/)
    // WYSIWYG: print must not shrink the preview layout (no font/padding/margin changes).
    const printBlock = html.match(/@media print\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? ''
    expect(printBlock.replace(/padding\s*:\s*0(?:\s*!important)?\s*;/g, '')).not.toMatch(/font-size\s*:|padding\s*:|margin-(?:top|bottom)\s*:/)
    expect(html).toContain('@page { size: A4 portrait; margin: 8mm; }')
  })

  it('uses print density in the screen preview', () => {
    const html = buildHtml(makeBill({}, 1))

    expect(html).toContain("@font-face { font-family: 'Noto Sans Thai'; src: url('/fonts/NotoSansThai-Bold.ttf') format('truetype'); font-style: normal; font-weight: 700; font-display: swap; }")
    expect(html).toMatch(/body\s*\{[^}]*line-height:\s*1\.2;/)
    expect(html).toMatch(/\.items\s*\{[^}]*margin-top:\s*7px;/)
    expect(html).toMatch(/\.items th\s*\{[^}]*padding:\s*3px;/)
    expect(html).toMatch(/\.items td\s*\{[^}]*padding:\s*3px;/)
    expect(html).toMatch(/\.signature-zone\s*\{[^}]*min-height:\s*30mm;[^}]*margin-top:\s*auto;/)
  })

  it('omits payment progress while preserving the complete purchase document', () => {
    const html = buildHtml(makeBill())

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
    const html = buildHtml(makeBill({
      advanceAllocatedAmount: 0,
      advanceAllocatedSubtotalAmount: 0,
      advanceAllocatedVatAmount: 0,
      advanceConsumedAmount: 0,
      advancePaymentDocNo: '',
      hasVat: false,
      status: 'active',
      statusLabel: 'ใช้งาน',
      vatAmount: 0,
    }))

    expect(html).not.toContain('>ชำระแล้ว<')
    expect(html).not.toContain('>ค้างชำระ<')
    expect(html).toContain('ยอดสุทธิที่ต้องจ่าย')
    expect(html).not.toContain('VAT 7%')
  })

  it('does not add a cancellation watermark to the historical supplier-swap status', () => {
    const html = buildHtml(makeBill({
      status: 'cancelled_supplier_swap',
      statusLabel: 'ยกเลิก/เปลี่ยน Supplier',
    }, 1))

    expect(html).not.toContain('<div class="watermark">ยกเลิก/เปลี่ยน Supplier</div>')
    expect(html).toContain('.watermark { display: none;')
  })

  it('renders numbered REMARK entries as separate hanging-indent rows', () => {
    const bill = makeBill({}, 1)
    bill.allocationRows[0]!.note = '- 1. สินค้าอื่น 6 กก. ซื้อเป็นกระทะดำ\n- 2. สินค้าอื่น 6.50 กก. ซื้อเป็นก้ามเบรค\n- 3. สินค้าอื่น 12.50 กก.'
    const html = buildHtml(bill)

    expect(html).not.toContain('- 1. สินค้าอื่น')
    expect(html.match(/class="remark-item"/g)).toHaveLength(3)
    expect(html).toContain('<span class="remark-index">1.</span>')
    expect(html).toContain('<span class="remark-index">2.</span>')
    expect(html).toContain('<span class="remark-index">3.</span>')
    expect(html).toMatch(/\.remark-item\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*max-content minmax\(0, 1fr\);/)
  })

  it('keeps the real PB012608-0070 REMARK sequence ordered from 1 through 8', () => {
    const bill = makeBill({ docNo: 'PB012608-0070' }, 1)
    bill.allocationRows[0]!.note = '- 1. สินค้าอื่น 6 กก. ซื้อเป็น กระทะดำ, ผัด - 2. สินค้าอื่น 6.50 กก. ซื้อเป็น ก้ามเบรคไม่แกะผ้า/เหล็ก - 3. สินค้าอื่น 12.50 กก. ซื้อเป็น ตะกั่วแข็ง - 4. สินค้าอื่น 34 กก. ซื้อเป็น อลูมิเนียมลูกสูบรถยนต์ไม่ติดเหล็ก - 5. สินค้าอื่น 5 กก. ซื้อเป็น อลูมิเนียมฮีตซิงค์ - 6. สินค้าอื่น 87 กก. ซื้อเป็น อลูมิเนียมบาง - 7. สินค้าอื่น 109 กก. ซื้อเป็น อลูมิเนียมหนารวม (ติดสี) - 8. ฝุ่น 4 กก.'
    const html = buildHtml(bill)

    expect(html.match(/class="remark-item"/g)).toHaveLength(8)
    expect([...html.matchAll(/class="remark-index">(\d+)\.<\/span>/g)].map((match) => Number(match[1])))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(html).toContain('สินค้าอื่น 6.50 กก. ซื้อเป็น ก้ามเบรคไม่แกะผ้า/เหล็ก')
    expect(html).toContain('สินค้าอื่น 12.50 กก. ซื้อเป็น ตะกั่วแข็ง')
    expect(html).not.toContain('- 1. สินค้าอื่น 6 กก.')
  })

  it('keeps numbering continuous and prints values only once when a row is segmented', () => {
    const bill = makeBill({}, 1)
    bill.allocationRows[0]!.note = '- 1. ข้อหนึ่ง\n- 2. ข้อสอง\n- 3. ข้อสาม'
    const html = buildPurchaseBillPrintHtml(bill, profile, {
      pagePlan: [
        {
          emptyRowHeights: [],
          isFinalPage: false,
          pageNo: 1,
          rowCapacity: 500,
          rows: [{ measuredHeight: 500, remarkEnd: 2, remarkStart: 0, showValues: true, sourceIndex: 0 }],
          totalPages: 2,
          usedRowHeight: 500,
        },
        {
          emptyRowHeights: [],
          isFinalPage: true,
          pageNo: 2,
          rowCapacity: 600,
          rows: [{ measuredHeight: 200, remarkEnd: 3, remarkStart: 2, showValues: false, sourceIndex: 0 }],
          totalPages: 2,
          usedRowHeight: 200,
        },
      ],
    })
    const pages = [...html.matchAll(/<main class="page[^"]*" data-print-page="\d+"[\s\S]*?<\/main>/g)].map((match) => match[0])
    const continuedRow = pages[1]?.match(/<tr class="item-row item-row-continuation"[\s\S]*?<\/tr>/)?.[0] ?? ''

    expect(pages[0]).toContain('<span class="remark-index">1.</span>')
    expect(pages[0]).toContain('<span class="remark-index">2.</span>')
    expect(continuedRow).toContain('<span class="remark-index">3.</span>')
    expect(continuedRow).toContain('สินค้า 1 (ต่อ)')
    expect(continuedRow).not.toContain('100.00')
    expect(continuedRow).not.toContain('10.00 กก.')
  })

  it('keeps multi-unit totals on separate lines and the rank column at 8mm', () => {
    const bill = makeBill({}, 2)
    bill.allocationRows[1]!.unit = 'ลัง'
    const html = buildHtml(bill)
    const finalFooter = html.match(/<tfoot data-page-totals="final">[\s\S]*?<\/tfoot>/)?.[0] ?? ''

    expect(finalFooter.match(/class="unit-total-line"/g)).toHaveLength(8)
    expect(finalFooter).not.toContain(' / ')
    expect(html).toContain('<col style="width:8mm">')
    expect(html).toContain('<th class="center unit-cell">หน่วย</th>')
    expect(html).toMatch(/\.rank-cell\s*\{[^}]*min-width:\s*8mm;[^}]*white-space:\s*nowrap;/)
  })

  it('normalizes kilogram aliases into one กก. column value and a separate unit column', () => {
    expect(normalizePurchaseBillPrintUnit('กิโลกรัม')).toBe('กก.')
    expect(normalizePurchaseBillPrintUnit('kg')).toBe('กก.')
    expect(normalizePurchaseBillPrintUnit('kgs')).toBe('กก.')
    expect(normalizePurchaseBillPrintUnit('kilograms')).toBe('กก.')
    expect(normalizePurchaseBillPrintUnit('ลัง')).toBe('ลัง')
    expect(normalizePurchaseBillPrintUnit(null)).toBeNull()
    expect(normalizePurchaseBillPrintUnit('')).toBeNull()
    expect(normalizePurchaseBillPrintText('สินค้า 662.50 กิโลกรัม / 1 kg / 2 kgs / 3 kilograms')).toBe('สินค้า 662.50 กก. / 1 กก. / 2 กก. / 3 กก.')

    const bill = makeBill({}, 3)
    bill.allocationRows[0]!.unit = 'กิโลกรัม'
    bill.allocationRows[1]!.unit = 'kg'
    bill.allocationRows[2]!.unit = 'กก.'
    const html = buildHtml(bill)
    const finalPage = html.match(/<main class="page[^\"]*"[^>]*data-final-page="true"[\s\S]*?<\/main>/)?.[0] ?? ''
    const finalFooter = finalPage.match(/<tfoot data-page-totals="final">[\s\S]*?<\/tfoot>/)?.[0] ?? ''

    expect(finalPage).not.toContain('กิโลกรัม')
    expect(finalPage).not.toContain(' kg')
    expect(finalPage).toContain('<td class="num strong">10.00</td>')
    expect(finalPage).toContain('<td class="unit-cell">กก.</td>')
    expect(finalFooter.match(/class="unit-total-line"/g)).toHaveLength(4)
    expect(finalFooter).toContain('<span class="unit-total-line">30.00</span>')
    expect(finalFooter).toContain('<span class="unit-total-line">กก.</span>')
  })

  it('keeps printing disabled until the measured A4 overflow gate passes', () => {
    const html = buildHtml(makeBill({}, 1))

    expect(html).toContain('data-pb-print-button disabled')
    expect(html).toContain('page.scrollHeight <= page.clientHeight + 1')
    expect(html).toContain('เอกสารล้น A4 — ยังไม่เปิดให้พิมพ์')
  })

  it('renders a hidden 194 x 281mm measurement pass with every REMARK split boundary', () => {
    const bill = makeBill({}, 1)
    bill.allocationRows[0]!.note = '- 1. ข้อหนึ่ง\n- 2. ข้อสอง\n- 3. ข้อสาม'
    const html = buildPurchaseBillPrintHtml(bill, profile, { measurementMode: true })

    expect(html).toContain('id="pb-measurement-root"')
    expect(html).toContain('data-measure-content-box')
    expect(html).toContain('data-measure-final-end')
    expect(html).toContain('data-measure-continuation-end')
    expect(html).toContain('<div class="page-label">(หน้า 1 / 1)</div>')
    expect(html.match(/data-measure-row="0:\d:\d"/g)).toHaveLength(6)
    expect(html).toMatch(/\.measure-content-box\s*\{[^}]*width:\s*194mm;[^}]*height:\s*281mm;/)
  })

  it('fails closed before generating an unsafe number of REMARK measurement candidates', () => {
    const bill = makeBill({}, 1)
    bill.allocationRows[0]!.note = Array.from(
      { length: 64 },
      (_, index) => `- ${index + 1}. รายการย่อย ${index + 1}`,
    ).join(' ')

    expect(() => buildPurchaseBillPrintHtml(bill, profile, { measurementMode: true }))
      .toThrow('REMARK ของ PB มีรายการย่อยมากเกินกว่าระบบจัดหน้าได้อย่างปลอดภัย')
  })

  it('does not apply the REMARK expansion guard to ordinary PB rows', () => {
    const bill = makeBill({}, 2_001)

    expect(() => buildPurchaseBillPrintHtml(bill, profile, { measurementMode: true })).not.toThrow()
  })
})

function assetDocument(fonts?: FontFaceSet) {
  return { fonts, images: [] } as unknown as Document
}

function loadedFontSet(load = vi.fn().mockResolvedValue([{ status: 'loaded' } as FontFace])) {
  const fonts = {
    load,
    ready: Promise.resolve(undefined),
  } as unknown as FontFaceSet
  return { fonts, load }
}

describe('purchase bill print asset gate', () => {
  it('fails closed when the browser cannot verify fonts', async () => {
    await expect(waitForPurchaseBillPrintAssets(assetDocument(), 50))
      .rejects.toThrow('Browser ไม่รองรับการตรวจสอบฟอนต์ Noto Sans Thai')
  })

  it('loads and verifies both regular and bold Noto Sans Thai before continuing', async () => {
    vi.useFakeTimers()
    try {
      const { fonts, load } = loadedFontSet()

      await waitForPurchaseBillPrintAssets(assetDocument(fonts), 8_000)

      expect(load).toHaveBeenNthCalledWith(1, "400 12px 'Noto Sans Thai'", 'กข123')
      expect(load).toHaveBeenNthCalledWith(2, "700 12px 'Noto Sans Thai'", 'กข123')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('fails closed and clears the timeout when a required font face is missing', async () => {
    vi.useFakeTimers()
    try {
      const { fonts } = loadedFontSet(vi.fn().mockResolvedValue([]))

      await expect(waitForPurchaseBillPrintAssets(assetDocument(fonts), 8_000))
        .rejects.toThrow('โหลดฟอนต์ Noto Sans Thai ไม่สำเร็จ')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('fails closed when a required font load rejects', async () => {
    const { fonts } = loadedFontSet(vi.fn().mockRejectedValue(new Error('font network error')))

    await expect(waitForPurchaseBillPrintAssets(assetDocument(fonts), 50))
      .rejects.toThrow('โหลดฟอนต์ Noto Sans Thai ไม่สำเร็จ')
  })
})
