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

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('receipt voucher print layout', () => {
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
})
