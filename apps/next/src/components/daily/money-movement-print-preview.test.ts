import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { CompanyProfilePrintValues } from '../../lib/company-profile'
import {
  buildPaymentDailyReportHtml,
  buildCustomerReceiptPrintHtml,
  buildPaymentVoucherPrintHtml,
  type MoneyRow,
  type PaymentHistoryDetail,
} from './MoneyMovementPageClient'

const source = readFileSync(new URL('./MoneyMovementPageClient.tsx', import.meta.url), 'utf8')
const companyProfileSource = readFileSync(new URL('../../app/admin/company-profile/CompanyProfilePageClient.tsx', import.meta.url), 'utf8')

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

function transactionPages(html: string, documentType: 'PMT' | 'RCP') {
  return [...html.matchAll(new RegExp(`<main class="page(?: [^"]+)*" data-document-type="${documentType}"[\\s\\S]*?</main>`, 'g'))]
    .map((match) => match[0])
}

function expectTransactionPagination(html: string, documentType: 'PMT' | 'RCP', expectedPages: number, expectedItems: number) {
  const pages = transactionPages(html, documentType)

  expect(pages).toHaveLength(expectedPages)
  expect(html).toMatch(/th\s*\{[^}]*overflow-wrap:\s*anywhere[^}]*word-break:\s*break-word/)
  expect(html).toMatch(/td\s*\{[^}]*overflow-wrap:\s*anywhere[^}]*word-break:\s*break-word/)
  expect(pages.reduce((count, page) => count + (page.match(/data-row-slot=/g)?.length ?? 0), 0)).toBe(expectedItems)
  pages.forEach((page, pageIndex) => {
    expect(page.match(/<tr(?: data-row-slot=| class="empty-row")/g)).toHaveLength(15)
    if (pageIndex < pages.length - 1) {
      expect(page).toContain('data-page-totals="placeholder"')
      expect(page).toContain('data-continuation-summary="placeholder"')
      expect(page.match(/class="continuation-summary-panel"/g)).toHaveLength(2)
      expect(page.match(/class="continuation-placeholder"/g)).toHaveLength(2)
      expect(page).not.toContain('data-page-totals="final"')
      expect(page).not.toContain('data-signatures="final"')
    } else {
      expect(page).toContain('data-page-totals="final"')
      expect(page).toContain('data-signatures="final"')
      expect(page).not.toContain('data-page-totals="placeholder"')
      expect(page).not.toContain('data-continuation-summary="placeholder"')
    }
  })
}

function paymentRow(): MoneyRow {
  return {
    accountName: 'ธนาคารทดสอบ',
    amount: 0,
    date: '2026-08-07',
    docNo: 'PMT2608-0001',
    id: 'payment-1',
    method: 'โอนเงิน',
    netAmount: 0,
    notes: 'ทดสอบแบ่งหน้า',
    partyName: 'ผู้ขายทดสอบ',
    status: 'paid',
  }
}

function paymentDetail(itemCount: number): PaymentHistoryDetail {
  const amount = itemCount * 100
  return {
    accountRows: [],
    approvalRows: Array.from({ length: itemCount }, (_, index) => ({
      amount: 100,
      docNo: `PMA-${index + 1}`,
      sourceDocNo: `PB-${index + 1}`,
    })),
    detailCards: [],
    docNo: 'PMT2608-0001',
    heading: 'ใบสำคัญจ่าย',
    latestStatusLabel: 'จ่ายแล้ว',
    latestTone: 'emerald',
    summary: {
      amount,
      fee: 0,
      netAmount: amount,
      statusLabel: 'จ่ายแล้ว',
      withholdingTax: 0,
    },
    timeline: [],
    timelineTitle: 'ประวัติ',
    type: 'payment',
  }
}

function receiptRow(itemCount: number): MoneyRow {
  const amount = itemCount * 100
  return {
    accountName: 'ธนาคารทดสอบ',
    amount,
    bookAmountThb: amount,
    bookNetCashInThb: amount,
    date: '2026-08-07',
    docNo: 'RCP2608-0001',
    id: 'receipt-1',
    method: 'โอนเงิน',
    netAmount: amount,
    notes: 'ทดสอบแบ่งหน้า',
    partyName: 'ลูกค้าทดสอบ',
    receiptLines: Array.from({ length: itemCount }, (_, index) => ({
      discountAmount: 0,
      lineNo: index + 1,
      receiptAmount: 100,
      salesBillDocNo: `SB-${index + 1}`,
      withholdingTaxAmount: 0,
    })),
    sourceType: 'SB',
    status: 'completed',
  }
}

function dailyReportRows(count: number, kind: 'payment' | 'receipt'): MoneyRow[] {
  return Array.from({ length: count }, (_, index) => ({
    ...paymentRow(),
    bookAmountThb: kind === 'receipt' ? 100 : undefined,
    bookNetCashInThb: kind === 'receipt' ? 100 : undefined,
    docNo: `${kind === 'receipt' ? 'RCP' : 'PMT'}2608-${String(index + 1).padStart(4, '0')}`,
    id: `${kind}-${index + 1}`,
    status: kind === 'receipt' ? 'completed' : 'paid',
  }))
}

function printBuilderSource(name: string, nextName: string) {
  const start = source.indexOf(`function ${name}`)
  const end = source.indexOf(`function ${nextName}`, start + 1)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('money document print previews', () => {
  it('uses the corporate paper contrast in every custom print window', () => {
    const builders = [
      printBuilderSource('buildPaymentDailyReportHtml', 'buildPaymentVoucherPrintHtml'),
      printBuilderSource('buildPaymentVoucherPrintHtml', 'buildCustomerReceiptPrintHtml'),
      printBuilderSource('buildBatchReceiptPrintHtml', 'buildForeignReceiptAuditPrintHtml'),
      printBuilderSource('buildReceivableBillPrintHtml', 'detailToneTextClass'),
    ]

    builders.forEach((builder) => {
      expect(builder).toMatch(/body \{[^}]*background:\s*#334155/)
      expect(builder).toMatch(/\.page \{[^}]*background:\s*#fff/)
      expect(builder).toMatch(/\.page \{[^}]*box-shadow:/)
      expect(builder).toMatch(/@media print \{[\s\S]*?body \{[^}]*background:\s*white/)
      expect(builder).toMatch(/@media print \{[\s\S]*?\.page \{[^}]*box-shadow:\s*none/)
    })

    expect(source).toContain("const companyName = missingCompanyData(profile.name).replace(/\\s+/g, ' ').trim()")
    expect(source).toMatch(/\.co-name \{[^}]*white-space:\s*nowrap/)
    expect(companyProfileSource).toMatch(/body \{[^}]*background:\s*#334155/)
    expect(companyProfileSource).toMatch(/\.page \{[^}]*box-shadow:/)
    expect(companyProfileSource).toContain("const companyName = (profile.name || '-').replace(/\\s+/g, ' ').trim()")
  })

  it('keeps PMT and RCP unlimited while reserving totals and signatures for the final page', () => {
    const paymentVoucher = printBuilderSource('buildPaymentVoucherPrintHtml', 'buildCustomerReceiptPrintHtml')
    const customerReceipts = printBuilderSource('buildBatchReceiptPrintHtml', 'buildForeignReceiptAuditPrintHtml')

    expect(paymentVoucher).toContain('paginateStandardPrintItems(paymentLines)')
    expect(customerReceipts).toContain('paginateStandardPrintItems(receiptLines)')
    for (const builder of [paymentVoucher, customerReceipts]) {
      expect(builder).toContain('data-page-totals="placeholder"')
      expect(builder).toContain('data-page-totals="final"')
      expect(builder).toContain('data-continuation-summary="placeholder"')
      expect(builder.match(/class="continuation-summary-panel"/g)).toHaveLength(2)
      expect(builder.match(/class="continuation-placeholder"/g)).toHaveLength(2)
      expect(builder).toContain('Continued on Page ${page.pageNo + 1}')
      expect(builder).toContain('data-signatures="final"')
    }

    expect(source).toContain("return buildBatchReceiptPrintHtml([{ profile, row }], row.docNo)")
  })

  it('renders PMT pagination behavior at every standard boundary', () => {
    PRINT_BOUNDARIES.forEach(({ count, pages }) => {
      const html = buildPaymentVoucherPrintHtml(paymentRow(), paymentDetail(count), profile)
      expectTransactionPagination(html, 'PMT', pages, count)
    })
  })

  it('renders RCP pagination behavior beyond two pages', () => {
    PRINT_BOUNDARIES.filter(({ count }) => count > 0).forEach(({ count, pages }) => {
      const html = buildCustomerReceiptPrintHtml(receiptRow(count), profile)
      expectTransactionPagination(html, 'RCP', pages, count)
    })
  })

  it.each([
    { count: 0, pages: 1 },
    { count: 1, pages: 1 },
    { count: 8, pages: 1 },
    { count: 9, pages: 2 },
    { count: 23, pages: 2 },
    { count: 24, pages: 3 },
  ])('keeps PMT and RCP daily reports within the first-page budget at $count rows', ({ count, pages }) => {
    for (const kind of ['payment', 'receipt'] as const) {
      const documentType = kind === 'payment' ? 'PMT' : 'RCP'
      const html = buildPaymentDailyReportHtml(dailyReportRows(count, kind), profile, {
        dateFrom: '2026-08-07',
        dateTo: '2026-08-07',
        kind,
        printedAt: new Date('2026-08-07T08:00:00.000Z'),
      })
      const reportPages = transactionPages(html, documentType)

      expect(reportPages).toHaveLength(pages)
      expect(reportPages[0]?.match(/<tr class=/g)?.length).toBe(count === 0 ? 1 : Math.min(count, 8))
      expect(reportPages.reduce((total, page) => total + (page.match(/<tr class=/g)?.length ?? 0), 0)).toBe(count || 1)
      reportPages.forEach((page, index) => {
        expect(page).toContain(`data-print-page="${index + 1}"`)
        expect(page).toContain(`data-final-page="${index === pages - 1}"`)
      })
    }
  })

  it('loads the branch company profile before printing payment and receipt history', () => {
    expect(source).toContain('async function printPaymentRowDirect(row: MoneyRow)')
    expect(source).toContain('const printWindow = window.open(\'\', \'_blank\', \'width=960,height=900,scrollbars=yes\')')
    expect(source).toContain("if (detail.type !== 'payment')")
    expect(source).toContain('await printPaymentVoucher(row, detail, printWindow)')
    expect(source).toContain('async function printPaymentVoucher(row: MoneyRow, detail: PaymentHistoryDetail, existingWindow?: Window)')
    expect(source).toContain('buildPaymentVoucherPrintHtml(row, detail, profile)')
    expect(source).toContain('async function printCustomerReceipt(row: MoneyRow)')
    expect(source).toContain('buildCustomerReceiptPrintHtml(row, profile)')
    expect(source).toContain('async function printSelectedReceipts()')
    expect(source).toContain('const entries = await loadCustomerReceiptPrintEntries(rowsToPrint)')
    expect(source).toContain('buildBatchReceiptPrintHtml(entries)')
    expect(source).toContain('const printGroup = `receipt-${entryIndex + 1}`')
    expect(source).toContain('data-print-group="${printGroup}"')
    expect(source).toContain("groupAttribute: 'data-print-group'")
    expect(source.match(/loadCompanyProfileForPrint\(row\.branchId\)/g)?.length).toBeGreaterThanOrEqual(3)
    expect(source).toContain("detail?.type === 'payment'")
    expect(source).toContain('readOnly')
  })
})
