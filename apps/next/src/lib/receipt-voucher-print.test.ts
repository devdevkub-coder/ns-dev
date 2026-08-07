import { afterEach, describe, expect, it, vi } from 'vitest'

import { openReceiptVoucherPrint, type ReceiptVoucherPrintDocument } from './receipt-voucher-print'

const longCompanyName = 'บริษัท เอ็นเอส สแครป เมทัล รีไซเคิล แอนด์ อินดัสเทรียล เซอร์วิสเซส จำกัด'

const document: ReceiptVoucherPrintDocument = {
  amountInWords: 'หนึ่งพันบาทถ้วน',
  date: '2026-07-19',
  docNo: 'RV012607-0001',
  id: 'RV012607-0001',
  items: [{ amount: 1_000, description: 'ทองแดง', id: '1', price: 100, qty: 10, unit: 'กก.' }],
  licensePlate: '1กข 1234',
  note: '',
  payerSignerName: 'ผู้สร้างเอกสาร',
  paymentMethod: 'รับเงินสด',
  purchaseBillDocNo: 'PB012607-0001',
  sellerAddress: 'กรุงเทพมหานคร',
  sellerName: 'ผู้รับเงินทดสอบ',
  sellerPhone: '0812345678',
  sellerTaxId: '1234567890123',
  status: 'active',
  totalAmount: 1_000,
  totalQty: 10,
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

function makeItems(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    amount: 100,
    description: `สินค้า ${index + 1}`,
    id: String(index + 1),
    price: 10,
    qty: 10,
    unit: 'กก.',
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('receipt voucher print layout', () => {
  it.each(PRINT_BOUNDARIES)('renders $count rows across $pages page(s)', async ({ count, pages: expectedPages }) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      profile: { address: '99 กรุงเทพ', logoUrl: null, name: longCompanyName, phone: '021234567', taxId: '0105559999999' },
      profileConfigured: true,
      selectedBranchName: null,
    }), { headers: { 'content-type': 'application/json' }, status: 200 })))

    let html = ''
    const printWindow = {
      document: { close: vi.fn(), open: vi.fn(), write: vi.fn((value: string) => { html = value }) },
      focus: vi.fn(),
    } as unknown as Window
    await openReceiptVoucherPrint({
      ...document,
      items: makeItems(count),
    }, printWindow)

    const pages = [...html.matchAll(/<div class="page[^"]*" data-print-page="\d+"[\s\S]*?<\/div>\s*(?=<div class="page|<\/body>)/g)].map((match) => match[0])
    expect(pages).toHaveLength(expectedPages)
    pages.forEach((page, index) => {
      expect(page.match(/data-row-slot/g)).toHaveLength(15)
      expect(page).toContain(`หน้า ${index + 1} / ${expectedPages}`)
      if (index < expectedPages - 1) {
        expect(page).toContain('data-page-totals="placeholder"')
        expect(page).toMatch(/data-page-totals="placeholder"[\s\S]*?>-\s*</)
        expect(page).toContain(`Continued on Page ${index + 2}`)
        expect(page).not.toContain('data-signatures="final"')
      } else {
        expect(page).toContain('data-page-totals="final"')
        expect(page).toContain('data-signatures="final"')
        expect(page).not.toContain('Continued on Page')
      }
    })
    const renderedItemCount = Math.max(1, count)
    expect([...html.matchAll(/data-row-slot="(\d+)"/g)].map((match) => Number(match[1]))).toEqual(
      Array.from({ length: renderedItemCount }, (_, index) => index + 1),
    )
  })

  it('gives the long Company Payer name a full row without leaving gaps in the two-column grid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      profile: {
        address: '99 ถนนอุตสาหกรรม กรุงเทพมหานคร',
        bankInfo: null,
        branchCode: '00000',
        email: null,
        fax: null,
        footerNote: null,
        logoUrl: null,
        name: longCompanyName,
        nameEn: null,
        phone: '021234567',
        taxId: '0105559999999',
        website: null,
      },
      profileConfigured: true,
      selectedBranchName: null,
    }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })))

    let html = ''
    const printWindow = {
      document: {
        close: vi.fn(),
        open: vi.fn(),
        write: vi.fn((value: string) => { html = value }),
      },
      focus: vi.fn(),
    } as unknown as Window

    await openReceiptVoucherPrint(document, printWindow)

    const payerStart = html.indexOf('<div class="panel-title">ผู้จ่ายเงิน / Company Payer</div>')
    const payerPanel = html.slice(payerStart, html.indexOf('</section>', payerStart))
    const fields = [...payerPanel.matchAll(/<div(?: class="([^"]+)")?>\s*<div class="field-label">([^<]+)<\/div>/g)]
      .map(([, className, label]) => ({ label, width: className === 'field-wide' ? 2 : 1 }))

    expect(payerStart).toBeGreaterThan(-1)
    expect(payerPanel).toContain(longCompanyName)
    expect(fields).toEqual([
      { label: 'บริษัท', width: 2 },
      { label: 'เลขประจำตัวผู้เสียภาษี', width: 1 },
      { label: 'โทร', width: 1 },
      { label: 'ที่อยู่', width: 2 },
      { label: 'ผู้จ่ายเงิน', width: 2 },
    ])
    expect(html).toMatch(/@page\s*\{\s*size:\s*A4 portrait/)
    expect(html).toMatch(/\.panel\s*\{[^}]*page-break-inside:\s*avoid/)
    expect(html).toMatch(/\.field-wide\s*\{[^}]*grid-column:\s*span 2/)
  })

  it('applies is-dense class and footer-group page break avoidance when item count is between 9 and 15', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      profile: { address: '99 กรุงเทพ', logoUrl: null, name: longCompanyName, phone: '021234567', taxId: '0105559999999' },
      profileConfigured: true,
      selectedBranchName: null,
    }), { headers: { 'content-type': 'application/json' }, status: 200 })))

    const twelveItemsDoc: ReceiptVoucherPrintDocument = {
      ...document,
      items: Array.from({ length: 12 }, (_, i) => ({
        amount: 100 * (i + 1),
        description: `สินค้า ${i + 1}`,
        id: String(i + 1),
        price: 10,
        qty: i + 1,
        unit: 'กก.',
      })),
    }

    let html = ''
    const printWindow = {
      document: { close: vi.fn(), open: vi.fn(), write: vi.fn((val: string) => { html = val }) },
      focus: vi.fn(),
    } as unknown as Window

    await openReceiptVoucherPrint(twelveItemsDoc, printWindow)

    expect(html).toContain('class="page is-dense"')
    expect(html).toContain('.page.is-dense')
    expect(html).toContain('class="footer-group"')
    expect(html).toMatch(/\.footer-group\s*\{[^}]*page-break-inside:\s*avoid/)
  })
})
