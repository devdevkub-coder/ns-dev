import { readFileSync } from 'node:fs'

import { renderToBuffer } from '@react-pdf/renderer'
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
// @ts-expect-error jsdom is available as a workspace test dependency but does not ship declarations here.
import { JSDOM } from 'jsdom'

import { WeightTicketProductBreakdownTable } from '@/components/daily/WeightTicketProductBreakdownTable'
import type { CompanyProfilePrintValues } from './company-profile'
import { ensurePdfFontsRegistered } from './server/pdf/fonts'
import { WeightTicketDocument } from './server/pdf/weight-ticket-document'
import { prepareCorporatePrintLayout } from './corporate-print-layout'
import {
  buildPrintWeightRows,
  buildReceiptPrintHtml,
  buildWeightTicketAttachmentImages,
  estimatePrintWeightRowHeight,
  NO_IMPURITY_SUMMARY_DETAIL,
  paginatePrintWeightRows,
  WEIGHT_TICKET_A4_ATTACHMENT_IMAGES_PER_PAGE,
  WEIGHT_TICKET_MAX_ROWS_PER_PAGE,
} from './weight-ticket-print'
import { encodeStoredImageReference, type WeightTicketRecord } from './weight-tickets'

vi.mock('server-only', () => ({}))

const profile: CompanyProfilePrintValues = {
  address: 'Bangkok',
  bankInfo: null,
  branchCode: '00000',
  email: null,
  fax: null,
  footerNote: 'ขอบคุณที่ใช้บริการค่ะ/ครับ',
  logoUrl: null,
  name: 'NS Scrap',
  nameEn: null,
  phone: '021234567',
  taxId: '0105559999999',
  website: null,
}

const weightTicketPrintSource = readFileSync(new URL('./weight-ticket-print.ts', import.meta.url), 'utf8')
const weightTicketPdfSource = readFileSync(new URL('./server/pdf/weight-ticket-document.tsx', import.meta.url), 'utf8')

function line(
  overrides: Partial<WeightTicketRecord['lines'][number]>,
): WeightTicketRecord['lines'][number] {
  return {
    containerDeductionWeight: '0',
    containerDeductionWeightValue: 0,
    deductionMode: 'none',
    deductionValue: '0',
    deductionWeight: 0,
    grossWeight: '0',
    grossWeightValue: 0,
    id: '',
    imageCount: 0,
    imageNames: [],
    impurityId: '',
    impurityName: '',
    lineNo: 0,
    netWeight: 0,
    note: '',
    productId: 'product-a',
    productName: 'สินค้า A',
    warehouseId: '',
    warehouseName: '',
    warehouseType: '',
    version: 1,
    ...overrides,
  }
}

const ticket: WeightTicketRecord = {
  branchId: 'branch-1',
  branchName: 'Main',
  canCancel: true,
  canEdit: true,
  cancelNote: '',
  cancelledAt: null,
  createdAt: '2026-07-19T00:00:00.000Z',
  createdBy: 'Tester',
  documentDate: '2026-07-19',
  documentNo: 'WTI190726-0001',
  downstreamAllocations: [],
  enteredBy: 'Tester',
  godownName: 'Main godown',
  id: 'ticket-1',
  imageCount: 0,
  imageNames: [],
  lines: [
    line({
      containerDeductionWeight: '2',
      containerDeductionWeightValue: 2,
      grossWeight: '205',
      grossWeightValue: 205,
      id: 'lot-1',
      lineNo: 1,
      netWeight: 171,
      note: 'Lot 1',
    }),
    line({
      containerDeductionWeight: '2',
      containerDeductionWeightValue: 2,
      grossWeight: '230',
      grossWeightValue: 230,
      id: 'lot-2',
      lineNo: 2,
      netWeight: 228,
      note: 'Lot 2',
      parentLineNo: 1,
    }),
    line({
      deductionMode: 'kg',
      deductionValue: '32',
      deductionWeight: 32,
      id: 'impurity-1',
      impurityId: 'impurity-1',
      impurityName: 'สิ่งเจือปน',
      lineNo: 3,
      parentLineNo: 1,
    }),
    line({
      grossWeight: '30',
      grossWeightValue: 30,
      id: 'purchase-1',
      impuritySourceLineNo: 3,
      lineNo: 4,
      netWeight: 30,
      note: 'มาจากสิ่งเจือปน (สิ่งเจือปน 30 กก.) ของรายการที่ 1: สินค้า A',
      productId: 'product-b',
      productName: 'สินค้า B',
    }),
  ],
  partyId: 'supplier-1',
  partyName: 'Supplier',
  pendingOutEvents: [],
  pendingOutHistory: [],
  productSummaries: [
    {
      billedWeight: 0,
      categoryName: 'โลหะ',
      containerDeductionWeight: 4,
      costSnapshotStatus: 'none',
      deductWeight: 32,
      grossWeight: 435,
      hasMixedDeductionProfiles: true,
      id: 'summary-a',
      lineCount: 3,
      netWeight: 399,
      pendingOutQty: 0,
      pendingOutValue: 0,
      productId: 'product-a',
      productName: 'สินค้า A',
      remainingWeight: 399,
      unitCostSnapshot: null,
    },
    {
      billedWeight: 0,
      categoryName: 'โลหะ',
      containerDeductionWeight: 0,
      costSnapshotStatus: 'none',
      deductWeight: 0,
      grossWeight: 30,
      hasMixedDeductionProfiles: false,
      id: 'summary-b',
      lineCount: 1,
      netWeight: 30,
      pendingOutQty: 0,
      pendingOutValue: 0,
      productId: 'product-b',
      productName: 'สินค้า B',
      remainingWeight: 30,
      unitCostSnapshot: null,
    },
  ],
  remark: '',
  status: 'received',
  timeline: [],
  totals: {
    containerDeductionWeight: 4,
    deductionWeight: 32,
    grossWeight: 465,
    netWeight: 429,
  },
  type: 'WTI',
  updatedAt: null,
  updatedBy: '',
  usageTimeline: [],
  usedInPurchaseBillCount: 0,
  usedInPurchaseBillDocNos: [],
  usedInSalesBillCount: 0,
  usedInSalesBillDocNos: [],
  vehicleImageCount: 0,
  vehicleImageNames: [],
  vehicleNo: 'TEST-1',
}

function nodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (!isValidElement<{ children?: ReactNode }>(node)) return ''
  const element = node as ReactElement<{ children?: ReactNode }>
  if (typeof element.type === 'function') {
    const component = element.type as (props: typeof element.props) => ReactNode
    return nodeText(component(element.props))
  }
  return Children.toArray(element.props.children).map(nodeText).join('')
}

function findParentWithDirectText(node: ReactNode, text: string): ReactNode | null {
  if (!isValidElement<{ children?: ReactNode }>(node)) return null
  const children = Children.toArray(node.props.children)
  for (const child of children) {
    const match = findParentWithDirectText(child, text)
    if (match) return match
  }
  const ownText = nodeText(node)
  return children.some((child) => {
    const childText = nodeText(child)
    return childText.includes(text) && childText !== ownText
  }) ? node : null
}

function tableRowCells(html: string, label: string) {
  const labelIndex = html.indexOf(label)
  const rowStart = html.lastIndexOf('<tr', labelIndex)
  const rowEnd = html.indexOf('</tr>', labelIndex)
  const row = html.slice(rowStart, rowEnd)
  return [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((match) => (
    match[1].replace(/<[^>]+>/g, '').trim()
  ))
}

function countPdfPages(buffer: Buffer) {
  return buffer.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0
}

const TEST_PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

function emptyDraftTicket(type: 'WTI' | 'WTO'): WeightTicketRecord {
  return {
    ...ticket,
    documentNo: `${type}190726-DRAFT`,
    lines: [],
    productSummaries: [],
    status: 'draft',
    totals: {
      containerDeductionWeight: 0,
      deductionWeight: 0,
      grossWeight: 0,
      netWeight: 0,
    },
    type,
  }
}

function ticketWithAttachmentCount(count: number): WeightTicketRecord {
  return {
    ...ticket,
    imageNames: Array.from({ length: count }, (_, index) => (
      encodeStoredImageReference(
        `attachment-${index + 1}.jpg`,
        `https://storage.example/attachment-${index + 1}.jpg?token=short`,
        `tickets/attachment-${index + 1}.jpg`,
        'weight-ticket-images',
      )
    )),
  }
}

function ticketWithPrintRowCount(count: number, type: 'WTI' | 'WTO' = 'WTI'): WeightTicketRecord {
  const lines = Array.from({ length: count }, (_, index) => line({
    grossWeight: '100',
    grossWeightValue: 100,
    id: `line-${index + 1}`,
    lineNo: index + 1,
    netWeight: 100,
    productId: `product-${index + 1}`,
    productName: `Product ${index + 1}`,
  }))

  return {
    ...ticket,
    documentNo: `${type}190726-MULTI`,
    lines,
    productSummaries: lines.map((ticketLine, index) => ({
      billedWeight: 0,
      categoryName: 'Metal',
      containerDeductionWeight: 0,
      costSnapshotStatus: 'none',
      deductWeight: 0,
      grossWeight: 100,
      hasMixedDeductionProfiles: false,
      id: `summary-${index + 1}`,
      lineCount: 1,
      netWeight: 100,
      pendingOutQty: 0,
      pendingOutValue: 0,
      productId: ticketLine.productId,
      productName: ticketLine.productName,
      remainingWeight: 100,
      unitCostSnapshot: null,
    })),
    totals: {
      containerDeductionWeight: 0,
      deductionWeight: 0,
      grossWeight: count * 100,
      netWeight: count * 100,
    },
    type,
  }
}

describe('weight ticket print HTML', () => {
  it('keeps 0, 1, 15, 16, 20, 21, 30, and 31 short rows ordered within the WTI/WTO limits', () => {
    for (const isReceipt of [true, false]) {
      for (const count of [0, 1, 15, 16, 20, 21, 30, 31]) {
        const rows = Array.from({ length: count }, (_, index) => ({
          containerDeductionWeight: 0,
          deductionWeight: 0,
          detail: '',
          grossWeight: 1,
          label: '',
          netWeight: 1,
          productName: `Row ${index + 1}`,
        }))
        const pages = paginatePrintWeightRows(rows, isReceipt)

        expect(pages.flatMap((page) => page.items)).toEqual(rows)
        expect(pages.every((page) => page.items.length <= WEIGHT_TICKET_MAX_ROWS_PER_PAGE)).toBe(true)
        expect(pages.every((page) => page.capacity === WEIGHT_TICKET_MAX_ROWS_PER_PAGE)).toBe(true)
        expect(pages.at(-1)?.items.length).toBeLessThanOrEqual(WEIGHT_TICKET_MAX_ROWS_PER_PAGE)
      }
    }
  })

  it('fills every WTI/WTO page with the full 20-row form table', () => {
    for (const type of ['WTI', 'WTO'] as const) {
      const ticketWithRows = ticketWithPrintRowCount(21, type)
      const rows = buildPrintWeightRows(ticketWithRows, type === 'WTI')
      const pages = paginatePrintWeightRows(rows, type === 'WTI')
      const html = buildReceiptPrintHtml(ticketWithRows, profile)
      const bodies = [...html.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)].map((match) => match[1])

      expect(pages.flatMap((page) => page.items)).toEqual(rows)
      expect(Math.max(...pages.map((page) => page.items.length))).toBeLessThanOrEqual(WEIGHT_TICKET_MAX_ROWS_PER_PAGE)
      expect(pages[0]?.items).toHaveLength(WEIGHT_TICKET_MAX_ROWS_PER_PAGE)
      expect(pages.at(-1)?.items.length).toBeLessThanOrEqual(WEIGHT_TICKET_MAX_ROWS_PER_PAGE)
      for (const body of bodies) {
        expect(body.match(/<tr class="item-row/g)).toHaveLength(WEIGHT_TICKET_MAX_ROWS_PER_PAGE)
      }
    }
  })

  it('keeps the explicit no-impurity detail for a WTI product total', () => {
    const rows = buildPrintWeightRows(ticketWithPrintRowCount(1, 'WTI'), true)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.detail).toContain('ไม่มีหักสิ่งเจือปน')
  })

  it('keeps the explicit no-impurity detail visible on every WTI form page at the shared font size', () => {
    const html = buildReceiptPrintHtml(ticketWithPrintRowCount(21, 'WTI'), profile)

    expect(html).toContain('ไม่มีหักสิ่งเจือปน')
    // WYSIWYG: every page uses the same 10.5px table font — no dense/smaller
    // font variant on crowded pages.
    expect(html).not.toContain('dense-inline')
    expect(html).not.toContain('dense-page')
    expect(html).not.toContain('.items.dense')
  })

  it('budgets a no-impurity label together with a near-limit WTI product name', async () => {
    await ensurePdfFontsRegistered()
    const ticketWithRows = ticketWithPrintRowCount(20, 'WTI')
    const longProductName = 'A'.repeat(30)
    ticketWithRows.lines[18] = { ...ticketWithRows.lines[18], productName: longProductName }
    ticketWithRows.productSummaries[18] = { ...ticketWithRows.productSummaries[18], productName: longProductName }

    const rows = buildPrintWeightRows(ticketWithRows, true)
    const pages = paginatePrintWeightRows(rows, true)
    const html = buildReceiptPrintHtml(ticketWithRows, profile)
    const htmlPages = [...html.matchAll(/<main class="page(?: dense-page)?" data-document-type="WTI" data-print-page="\d+"[\s\S]*?<\/main>/g)].map((match) => match[0])
    const pdf = await renderToBuffer(WeightTicketDocument({ profile, ticket: ticketWithRows }))

    expect(rows[18]?.detail).toBe(NO_IMPURITY_SUMMARY_DETAIL)
    // The product-total label stays on one 20-row form page: its short
    // no-impurity detail costs the same single grid slot as any other row.
    expect(estimatePrintWeightRowHeight(rows[18]!, true)).toBe(1)
    expect(pages.map((page) => page.items.length)).toEqual([20])
    expect(htmlPages).toHaveLength(pages.length)
    expect(htmlPages[0]).toContain(longProductName)
    expect(htmlPages.at(-1)).toContain('data-page-totals="final"')
    expect(htmlPages.at(-1)).toContain('data-signatures="final"')
    expect(countPdfPages(Buffer.from(pdf))).toBe(pages.length)
  }, 30_000)

  it('keeps a tall wrapped WTI row on the single 20-cell final form', () => {
    const row = {
      containerDeductionWeight: 0,
      deductionWeight: 0,
      detail: 'x'.repeat(613),
      grossWeight: 1,
      label: '',
      netWeight: 1,
      productName: 'X',
    }

    expect(estimatePrintWeightRowHeight(row, true)).toBe(19)
    const pages = paginatePrintWeightRows([row], true)

    expect(pages.map((page) => page.items.length)).toEqual([1])
    expect(pages.flatMap((page) => page.items)).toEqual([row])
    expect(pages[0]?.capacity).toBe(WEIGHT_TICKET_MAX_ROWS_PER_PAGE)
  })

  it('moves a wrapped WTI row to the next page as a complete row', () => {
    const shortRows = Array.from({ length: 18 }, (_, index) => ({
      containerDeductionWeight: 0,
      deductionWeight: 0,
      detail: '',
      grossWeight: 1,
      label: '',
      netWeight: 1,
      productName: `Short ${index + 1}`,
    }))
    const wrappedRow = {
      ...shortRows[0],
      detail: 'รายละเอียดที่ยาวมาก '.repeat(12),
      productName: 'Wrapped row',
    }
    const pages = paginatePrintWeightRows([...shortRows, wrappedRow, { ...shortRows[0], productName: 'After wrapped' }], true)

    expect(estimatePrintWeightRowHeight(wrappedRow, true)).toBeGreaterThan(1)
    expect(pages[0]?.items.map((row) => row.productName)).toEqual(shortRows.map((row) => row.productName))
    expect(pages.slice(1).flatMap((page) => page.items).map((row) => row.productName)).toEqual([
      'Wrapped row',
      'After wrapped',
    ])
  })

  it('keeps twelve rows with wrapped detail on the single WTI form page', () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      containerDeductionWeight: 0,
      deductionWeight: 0,
      detail: index === 5 ? 'รายละเอียดที่ยาวมาก '.repeat(3) : '',
      grossWeight: 1,
      label: '',
      netWeight: 1,
      productName: `Row ${index + 1}`,
    }))

    const pages = paginatePrintWeightRows(rows, true)

    expect(pages).toHaveLength(1)
    expect(pages.flatMap((page) => page.items)).toEqual(rows)
    expect(pages[0]?.capacity).toBe(WEIGHT_TICKET_MAX_ROWS_PER_PAGE)
    expect(pages[0]?.estimatedHeight).toBe(13)
  })

  it('rejects a row taller than one A4 form instead of emitting an invalid page plan', () => {
    const oversizedRow = {
      containerDeductionWeight: 0,
      deductionWeight: 0,
      detail: 'รายละเอียดที่ยาวมาก '.repeat(80),
      grossWeight: 1,
      label: '',
      netWeight: 1,
      productName: 'Oversized row',
    }

    expect(() => paginatePrintWeightRows([oversizedRow], true)).toThrow('รายการ WTI/WTO ยาวเกินพื้นที่หนึ่งหน้า A4')
  })

  it('keeps WTI/WTO HTML and React-PDF page plans aligned without losing rows', async () => {
    await ensurePdfFontsRegistered()

    for (const type of ['WTI', 'WTO'] as const) {
      const ticketWithRows = ticketWithPrintRowCount(31, type)
      const rows = buildPrintWeightRows(ticketWithRows, type === 'WTI')
      const pages = paginatePrintWeightRows(rows, type === 'WTI')
      const html = buildReceiptPrintHtml(ticketWithRows, profile)
      const htmlPages = [...html.matchAll(/<main class="page(?: dense-page)?" data-document-type="(?:WTI|WTO)" data-print-page="\d+"[\s\S]*?<\/main>/g)]
      const pdf = await renderToBuffer(WeightTicketDocument({ profile, ticket: ticketWithRows }))

      expect(pages.flatMap((page) => page.items)).toEqual(rows)
      expect(pages.every((page) => page.items.length <= WEIGHT_TICKET_MAX_ROWS_PER_PAGE)).toBe(true)
      expect(htmlPages).toHaveLength(pages.length)
      expect(htmlPages.at(-1)?.[0]).toContain(`หน้า ${pages.length} / ${pages.length}`)
      expect(htmlPages.at(-1)?.[0]).toContain('data-signatures="final"')
      expect(countPdfPages(Buffer.from(pdf))).toBe(pages.length)
    }
  }, 30_000)

  it('keeps a fitting long WTI row intact within the rendered PDF page plan', async () => {
    await ensurePdfFontsRegistered()
    const longTicket = ticketWithPrintRowCount(20, 'WTI')
    const longLineIndex = 16
    longTicket.lines[longLineIndex] = {
      ...longTicket.lines[longLineIndex],
      note: 'รายละเอียดที่ยาวมาก '.repeat(10),
    }
    const rows = buildPrintWeightRows(longTicket, true)
    const pages = paginatePrintWeightRows(rows, true)
    const pdf = await renderToBuffer(WeightTicketDocument({ profile, ticket: longTicket }))

    expect(weightTicketPdfSource).toMatch(/function ItemRow[\s\S]*?<View style=\{\[styles\.tableRow, bgStyle\]\} wrap=\{false\}/)
    expect(pages.flatMap((page) => page.items)).toEqual(rows)
    expect(countPdfPages(Buffer.from(pdf))).toBe(pages.length)
  }, 30_000)

  it('keeps all product ranks sequential and present without skipping items when middle products have multiple lots and impurity details', async () => {
    await ensurePdfFontsRegistered()
    const ticketWith20: WeightTicketRecord = {
      ...ticket,
      documentNo: 'WTI012608-0327',
      lines: [],
      productSummaries: [],
      totals: {
        containerDeductionWeight: 100,
        deductionWeight: 50,
        grossWeight: 10000,
        netWeight: 9850,
      },
      type: 'WTI',
    }

    for (let i = 1; i <= 20; i++) {
      const prodId = `prod-${i}`
      let name = `สินค้า ${i}`
      if (i === 13) name = 'อลูมิเนียมบาง (มู่ลี่)'
      if (i === 14) name = 'อลูมิเนียมบาง'
      if (i === 15) name = 'ทองแดงเบอร์ 3'
      if (i === 16) name = 'ทองแดงเบอร์ 2'
      if (i === 20) name = 'ทองแดงเบอร์ 5'

      ticketWith20.productSummaries.push({
        billedWeight: 0,
        categoryName: 'หมวดโลหะ',
        containerDeductionWeight: 5,
        costSnapshotStatus: 'none',
        deductWeight: i === 14 ? 3 : 0,
        grossWeight: 100,
        hasMixedDeductionProfiles: false,
        id: `summary-${i}`,
        lineCount: i === 15 ? 4 : i === 14 ? 2 : 1,
        netWeight: 95,
        pendingOutQty: 0,
        pendingOutValue: 0,
        productId: prodId,
        productName: name,
        remainingWeight: 95,
        unitCostSnapshot: null,
      })

      if (i === 14) {
        ticketWith20.lines.push(line({
          containerDeductionWeight: '13.5',
          containerDeductionWeightValue: 13.5,
          deductionWeight: 3,
          grossWeight: '2600',
          grossWeightValue: 2600,
          id: 'line-14-1',
          lineNo: 140,
          netWeight: 2583.5,
          note: 'ติดเหล็ก 3 กก.',
          productId: prodId,
          productName: name,
        }))
        ticketWith20.lines.push(line({
          containerDeductionWeight: '0',
          containerDeductionWeightValue: 0,
          deductionWeight: 3,
          grossWeight: '0',
          grossWeightValue: 0,
          id: 'line-14-2',
          impurityId: '1',
          impurityName: 'ติดเหล็ก',
          lineNo: 141,
          netWeight: -3,
          note: '',
          productId: prodId,
          productName: name,
        }))
      } else if (i === 15) {
        ticketWith20.lines.push(line({
          containerDeductionWeight: '3',
          containerDeductionWeightValue: 3,
          deductionWeight: 0,
          grossWeight: '287.5',
          grossWeightValue: 287.5,
          id: 'line-15-1',
          lineNo: 151,
          netWeight: 284.5,
          note: '',
          productId: prodId,
          productName: name,
        }))
        ticketWith20.lines.push(line({
          containerDeductionWeight: '3',
          containerDeductionWeightValue: 3,
          deductionWeight: 0,
          grossWeight: '244',
          grossWeightValue: 244,
          id: 'line-15-2',
          lineNo: 152,
          netWeight: 241,
          note: '',
          productId: prodId,
          productName: name,
        }))
        ticketWith20.lines.push(line({
          containerDeductionWeight: '0',
          containerDeductionWeightValue: 0,
          deductionWeight: 4.5,
          grossWeight: '0',
          grossWeightValue: 0,
          id: 'line-15-3',
          impurityId: '2',
          impurityName: 'ฝุ่น',
          lineNo: 153,
          netWeight: -4.5,
          note: '',
          productId: prodId,
          productName: name,
        }))
        ticketWith20.lines.push(line({
          containerDeductionWeight: '0',
          containerDeductionWeightValue: 0,
          deductionWeight: 0,
          grossWeight: '4.5',
          grossWeightValue: 4.5,
          id: 'line-15-4',
          impuritySourceLineNo: 153,
          lineNo: 154,
          netWeight: 4.5,
          note: 'มาจากสิ่งเจือปน (ฝุ่น) ของรายการที่ 1: SKU114 - ทองแดงเบอร์ 3 Candy',
          productId: prodId,
          productName: name,
        }))
      } else {
        ticketWith20.lines.push(line({
          containerDeductionWeight: '5',
          containerDeductionWeightValue: 5,
          deductionWeight: 0,
          grossWeight: '100',
          grossWeightValue: 100,
          id: `line-${i}`,
          lineNo: i * 10,
          netWeight: 95,
          note: '',
          productId: prodId,
          productName: name,
        }))
      }
    }

    const rows = buildPrintWeightRows(ticketWith20, true)
    const pages = paginatePrintWeightRows(rows, true)
    const allRanks = pages.flatMap((p) => p.items).map((r) => r.rank).filter(Boolean)
    const expectedRanks = Array.from({ length: 20 }, (_, i) => String(i + 1))

    expect(allRanks).toEqual(expectedRanks)

    const html = buildReceiptPrintHtml(ticketWith20, profile)
    for (let i = 1; i <= 20; i++) {
      expect(html).toContain(`>${i}<`)
    }

    const pdf = await renderToBuffer(WeightTicketDocument({ profile, ticket: ticketWith20 }))
    expect(countPdfPages(Buffer.from(pdf))).toBe(pages.length)
  }, 30_000)

  it('uses the corporate preview contrast and keeps the legal company name on one line', () => {
    const companyName = 'บริษัท นิวโซลูชั่นส์ (ไทยแลนด์) จำกัด (สำนักงานใหญ่)'
    const html = buildReceiptPrintHtml(ticket, {
      ...profile,
      name: `บริษัท นิวโซลูชั่นส์ (ไทยแลนด์) จำกัด\n(สำนักงานใหญ่)`,
    })

    expect(html).toContain(`class="company-name">${companyName}</div>`)
    expect(html).not.toContain('จำกัด\n(สำนักงานใหญ่)')
    expect(html).toMatch(/body\s*\{[^}]*background:\s*#334155/)
    expect(html).toMatch(/\.page\s*\{[^}]*box-shadow:/)
    expect(html).toMatch(/\.company-name\s*\{[^}]*white-space:\s*nowrap/)
    expect(html).toMatch(/\.bottom-zone\s*\{[^}]*margin-top:\s*auto/)
  })

  it('assigns every WTI/WTO form row the same table slot instead of letting populated rows consume blank-row space', () => {
    const html = buildReceiptPrintHtml(ticketWithPrintRowCount(1), profile)
    const document = new JSDOM(html).window.document
    const table = document.querySelector<HTMLTableElement>('table.items')
    const style = document.querySelector('style')?.textContent ?? ''

    expect(table).not.toBeNull()
    expect(table?.style.getPropertyValue('--item-row-slots')).toBe('20')
    expect(table?.tBodies.item(0)?.rows).toHaveLength(20)
    expect(style).toContain('.items tbody > tr { height: calc(100% / var(--item-row-slots)); }')
    expect(style).not.toMatch(/\.items \.empty td\s*\{[^}]*height:/)
    expect(style).not.toMatch(/\.items \.final-empty td\s*\{[^}]*height:/)
  })

  it('keeps WTI/WTO form pagination owned by the dedicated paginator', () => {
    expect(weightTicketPrintSource).toContain('maxRowsPerPage: WEIGHT_TICKET_MAX_ROWS_PER_PAGE')
    expect(weightTicketPrintSource).toContain('reflowRows: true')
  })

  it('turns an initially single WTI form into a three-panel continuation without copying totals or signatures', async () => {
    const dom = new JSDOM(buildReceiptPrintHtml(ticketWithPrintRowCount(12), profile))
    const document = dom.window.document
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        load: async () => [{ status: 'loaded' }],
        ready: Promise.resolve(),
      },
    })
    Object.defineProperties(dom.window.HTMLElement.prototype, {
      clientHeight: { configurable: true, get: () => 150 },
      clientWidth: { configurable: true, get: () => 800 },
      scrollHeight: {
        configurable: true,
        get(this: HTMLElement) {
          const realRows = this.querySelectorAll('tr[data-row-slot]:not([data-row-slot^="empty-"])').length
          return realRows > 8 ? 200 : 100
        },
      },
      scrollWidth: { configurable: true, get: () => 800 },
    })

    await prepareCorporatePrintLayout(document, {
      maxRowsPerPage: WEIGHT_TICKET_MAX_ROWS_PER_PAGE,
      reflowRows: true,
    })

    const pages = [...document.querySelectorAll<HTMLElement>('[data-corporate-print-page="true"]')]
    expect(pages).toHaveLength(2)
    expect(pages[0]?.querySelector('[data-page-totals="final"]')).toBeNull()
    expect(pages[0]?.querySelector('[data-page-totals="placeholder"]')).not.toBeNull()
    expect(pages[0]?.querySelector('[data-signatures="final"]')).toBeNull()
    expect(pages[0]?.querySelector('section.bottom-grid.continuation-summary[data-continuation-panels="placeholder"]')).not.toBeNull()
    expect(pages[0]?.querySelectorAll('[data-continuation-panels="placeholder"] .continuation-summary-panel')).toHaveLength(3)
    expect(pages[0]?.textContent).toContain('ข้อมูลน้ำหนัก / Weight Info')
    expect(pages[1]?.querySelector('[data-page-totals="final"]')).not.toBeNull()
    expect(pages[1]?.querySelector('[data-signatures="final"]')).not.toBeNull()
  })

  it('shows titled placeholder summary panels and replaces signatures with a continuation marker on non-final HTML/PDF pages', async () => {
    const multiPageTicket = ticketWithPrintRowCount(21)
    const html = buildReceiptPrintHtml(multiPageTicket, profile)
    const pages = [...html.matchAll(/<main class="page(?: dense-page)?" data-document-type="(?:WTI|WTO)" data-print-page="\d+"[\s\S]*?<\/main>/g)].map((match) => match[0])

    expect(pages).toHaveLength(2)
    expect(pages[0]).toContain('data-continuation-panels="placeholder"')
    expect(pages[0].match(/class="panel continuation-summary-panel"/g)).toHaveLength(3)
    expect(pages[0].match(/class="continuation-placeholder"/g)).toHaveLength(3)
    expect(pages[0]).toContain('สรุปตามหมวดสินค้า')
    expect(pages[0]).toContain('หมายเหตุ')
    expect(pages[0]).toContain('ข้อมูลน้ำหนัก / Weight Info')
    expect(pages[0]).toContain('>-</div>')
    expect(pages[0]).toContain('Continued on Page 2')
    expect(pages[0]).not.toContain('data-signatures="final"')
    expect(pages[1]).toContain('data-signatures="final"')
    expect(pages[1]).not.toContain('data-continuation-panels="placeholder"')

    await ensurePdfFontsRegistered()
    const pdfDocument = WeightTicketDocument({ profile, ticket: multiPageTicket })
    const pdfText = nodeText(pdfDocument)
    expect(pdfText).toContain('Continued on Page 2')
    expect(pdfText.match(/สรุปตามหมวดสินค้า/g)).toHaveLength(2)
    expect(pdfText.match(/หมายเหตุ/g)).toHaveLength(2)
    expect(pdfText.match(/Weight Info/g)).toHaveLength(2)
    expect(countPdfPages(Buffer.from(await renderToBuffer(pdfDocument)))).toBe(2)
  }, 30_000)

  it('loads the existing local Thai fonts without external stylesheets', () => {
    const html = buildReceiptPrintHtml(ticket, profile)

    expect(html).not.toMatch(/<link\b/i)
    expect(html).not.toMatch(/@import\b/i)
    expect(html).not.toContain('fonts.googleapis.com')
    expect(html).not.toContain('fonts.gstatic.com')
    expect(html).toContain("url('/fonts/NotoSansThai-Regular.ttf')")
    expect(html).toContain("url('/fonts/NotoSansThai-Bold.ttf')")
    expect(html).toContain("font-family: 'Noto Sans Thai', Arial, sans-serif")
    // WYSIWYG: print must not shrink the preview layout (no font/padding/margin changes).
    const printBlock = html.match(/@media print\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? ''
    expect(printBlock.replace(/padding\s*:\s*0(?:\s*!important)?\s*;/g, '')).not.toMatch(/font-size\s*:|padding\s*:|margin-(?:top|bottom)\s*:/)
    expect(html).not.toContain('ขอบคุณที่ใช้บริการค่ะ/ครับ')
    expect(html).not.toContain('class="footer"')
  })

  it('renders private-bucket vehicle images from short-lived signed URLs only', () => {
    const signedUrl = 'https://storage.example/signed-vehicle.jpg?token=short'
    const html = buildReceiptPrintHtml({
      ...ticket,
      vehicleImageNames: [
        encodeStoredImageReference('vehicle.jpg', signedUrl, 'tickets/vehicle.jpg', 'weight-ticket-images'),
        'legacy.jpg|data:image/jpeg;base64,AAAA',
      ],
    }, profile)

    expect(html).toContain(signedUrl)
    expect(html).not.toContain('data:image/jpeg;base64,AAAA')
  })

  it('resolves thumbnail-only references (production shape) for print, PDF and LINE', () => {
    // Production previews only ever carry a thumbnail signed URL on
    // thumbnailUrl — the full-size url is null. Print/PDF/LINE must still
    // render the attachment images.
    const thumbnailUrl = 'https://storage.example/thumb-product.jpg?token=short'
    const thumbnailOnly = encodeStoredImageReference(
      'product-photo.jpg',
      undefined,
      'tickets/product-photo.jpg',
      'weight-ticket-images',
      'thumbs/product-photo.jpg',
      thumbnailUrl,
      'ready',
    )
    const ticketWithThumbnails = { ...ticket, imageNames: [thumbnailOnly] }

    const images = buildWeightTicketAttachmentImages(ticketWithThumbnails)
    expect(images.map((image) => image.fileName)).toEqual(['product-photo.jpg'])
    expect(images[0].url).toBe(thumbnailUrl)

    const html = buildReceiptPrintHtml(ticketWithThumbnails, profile)
    expect(html).toContain(thumbnailUrl)
    expect(html).toContain('ใบรับสินค้า (รูปถ่ายแนบ)')

    // Legacy/dev records carrying a real url keep taking precedence.
    const withRealUrl = encodeStoredImageReference(
      'product-photo.jpg',
      'https://storage.example/full-product.jpg?token=full',
      'tickets/product-photo.jpg',
      'weight-ticket-images',
      'thumbs/product-photo.jpg',
      thumbnailUrl,
      'ready',
    )
    expect(buildWeightTicketAttachmentImages({ ...ticket, imageNames: [withRealUrl] })[0].url).toBe(
      'https://storage.example/full-product.jpg?token=full',
    )
  })

  it('puts vehicle images before product evidence in the shared print/PDF attachment album', () => {
    const vehicle = encodeStoredImageReference('vehicle-first.jpg', 'https://storage.example/vehicle-first.jpg?token=short', 'tickets/vehicle-first.jpg', 'weight-ticket-images')
    const product = encodeStoredImageReference('product-second.jpg', 'https://storage.example/product-second.jpg?token=short', 'tickets/product-second.jpg', 'weight-ticket-images')
    const ticketWithAttachments = { ...ticket, imageNames: [product], vehicleImageNames: [vehicle] }

    expect(buildWeightTicketAttachmentImages(ticketWithAttachments).map((image) => image.fileName)).toEqual([
      'vehicle-first.jpg',
      'product-second.jpg',
    ])

    expect(buildWeightTicketAttachmentImages({
      ...ticketWithAttachments,
      imageNames: [vehicle, product],
    }).map((image) => image.fileName)).toEqual([
      'vehicle-first.jpg',
      'product-second.jpg',
    ])

    const refreshedVehicleReference = encodeStoredImageReference('vehicle-renamed.jpg', 'https://storage.example/refreshed-url.jpg?token=new', 'tickets/vehicle-first.jpg', 'weight-ticket-images')
    const sameNameDifferentStorage = encodeStoredImageReference('vehicle-first.jpg', 'https://storage.example/other-vehicle.jpg?token=other', 'tickets/other-vehicle.jpg', 'weight-ticket-images')
    expect(buildWeightTicketAttachmentImages({
      ...ticketWithAttachments,
      imageNames: [refreshedVehicleReference, sameNameDifferentStorage],
    }).map((image) => image.fileName)).toEqual([
      'vehicle-first.jpg',
      'vehicle-first.jpg',
    ])

    const html = buildReceiptPrintHtml(ticketWithAttachments, profile)
    expect(html).toContain('ใบรับสินค้า (รูปถ่ายแนบ)')
    expect(html).not.toContain('รูปรถส่งของ')
    expect(html.indexOf('vehicle-first.jpg')).toBeLessThan(html.indexOf('product-second.jpg'))

    const pdfDocumentText = nodeText(WeightTicketDocument({ profile, ticket: ticketWithAttachments }))
    expect(pdfDocumentText.indexOf('vehicle-first.jpg')).toBeLessThan(pdfDocumentText.indexOf('product-second.jpg'))
  })

  it('does not add receive or dispatch tags to attachment photos', () => {
    const ticketWithAttachments = {
      ...ticket,
      imageNames: [
        encodeStoredImageReference(
          'product-photo.jpg',
          'https://storage.example/product-photo.jpg?token=short',
          'tickets/product-photo.jpg',
          'weight-ticket-images',
        ),
      ],
    }

    const html = buildReceiptPrintHtml(ticketWithAttachments, profile)
    expect(html).not.toContain('album-badge')
    expect(html).not.toContain('>รับเข้า<')
    expect(html).not.toContain('>ขาออก<')
  })

  it('keeps six attachments on one A4 album page and spills the seventh to the next page', () => {
    expect(WEIGHT_TICKET_A4_ATTACHMENT_IMAGES_PER_PAGE).toBe(6)

    const sixImageHtml = buildReceiptPrintHtml(ticketWithAttachmentCount(6), profile)
    expect(sixImageHtml.match(/class="page attachment-page"/g)).toHaveLength(1)
    expect(sixImageHtml).toContain('#6')
    expect(sixImageHtml).not.toContain('#7')

    const sevenImageHtml = buildReceiptPrintHtml(ticketWithAttachmentCount(7), profile)
    expect(sevenImageHtml.match(/class="page attachment-page"/g)).toHaveLength(2)
    expect(sevenImageHtml).toContain('#6')
    expect(sevenImageHtml).toContain('#7')
    expect(sevenImageHtml).toContain('หน้า 2 / 3')
    expect(sevenImageHtml).toContain('หน้า 3 / 3')
  })

  it('sizes the photo album page on the same A4 box as the normalized item pages', () => {
    // The shared fitter (prepareCorporatePrintLayout) normalizes every item
    // page to a 210×297mm box with 8mm padding. The album pages carry no
    // data-print-page so they never get normalized — they must match by CSS
    // so the photo paper is not narrower than the item paper in the popup.
    const html = buildReceiptPrintHtml(ticketWithAttachmentCount(6), profile)
    const document = new JSDOM(html).window.document
    const style = document.querySelector('style')?.textContent ?? ''

    expect(style).toMatch(/\.attachment-page \{[^}]*width: 210mm[^}]*height: 297mm[^}]*min-height: 297mm[^}]*max-height: 297mm[^}]*padding: 8mm/)
    expect(style).toMatch(/@media print \{[\s\S]*\.attachment-page \{[^}]*width: 194mm[^}]*height: 281mm[^}]*padding: 0/)
  })

  it('keeps rendered PDF attachment pagination aligned with the six-image A4 contract', async () => {
    const originalFetch = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('storage.example')) {
        return new Response(TEST_PNG_BYTES, { headers: { 'content-type': 'image/png' } })
      }
      return originalFetch(input, init)
    }))

    try {
      await ensurePdfFontsRegistered()

      const sixImagePdf = await renderToBuffer(WeightTicketDocument({ profile, ticket: ticketWithAttachmentCount(6) }))
      expect(countPdfPages(Buffer.from(sixImagePdf))).toBe(2)

      const sevenImagePdf = await renderToBuffer(WeightTicketDocument({ profile, ticket: ticketWithAttachmentCount(7) }))
      expect(countPdfPages(Buffer.from(sevenImagePdf))).toBe(3)
    } finally {
      vi.unstubAllGlobals()
    }
  }, 120_000)

  it('uses the complete ticket totals in Weight Info when impurity is purchased as another product', () => {
    const html = buildReceiptPrintHtml(ticket, profile)
    const weightInfo = html.match(/<div class="panel-title">ข้อมูลน้ำหนัก \/ Weight Info<\/div>([\s\S]*?)<\/div>\s*<\/div>\s*<\/section>/)?.[0]

    expect(weightInfo).toContain('2 รายการ')
    expect(weightInfo).toContain('465.00 kg')
    expect(weightInfo).toContain('4.00 kg')
    expect(weightInfo).toContain('32.00 kg')
    expect(weightInfo).toContain('429.00 kg')
  })

  it('uses the same complete ticket totals in React-PDF Weight Info', () => {
    const document = WeightTicketDocument({ profile, ticket })
    const weightInfo = findParentWithDirectText(document, 'Weight Info')
    const text = nodeText(weightInfo)

    expect(text).toContain('2 รายการ')
    expect(text).toContain('465.00 kg')
    expect(text).toContain('4.00 kg')
    expect(text).toContain('32.00 kg')
    expect(text).toContain('429.00 kg')
  })

  it('renders empty WTI and WTO drafts in one-page HTML/PDF output', async () => {
    await ensurePdfFontsRegistered()

    for (const type of ['WTI', 'WTO'] as const) {
      const draft = emptyDraftTicket(type)
      const html = buildReceiptPrintHtml(draft, profile)
      const pdf = await renderToBuffer(WeightTicketDocument({ profile, ticket: draft }))

      expect(html).toContain(draft.documentNo)
      expect(countPdfPages(Buffer.from(pdf))).toBe(1)
    }
  }, 30_000)

  it('numbers WTI lot rows in the product name without empty lot captions', () => {
    const ticketWithThreeLots: WeightTicketRecord = {
      ...ticket,
      lines: [
        ...ticket.lines.map((ticketLine) => (
          ticketLine.id === 'lot-1' || ticketLine.id === 'lot-2'
            ? { ...ticketLine, note: '' }
            : ticketLine
        )),
        line({
          grossWeight: '100',
          grossWeightValue: 100,
          id: 'lot-3',
          lineNo: 5,
          netWeight: 100,
          note: '',
          parentLineNo: 1,
        }),
      ],
    }

    const lotRows = buildPrintWeightRows(ticketWithThreeLots, true)
      .filter((row) => row.className === 'lot-row')

    expect(lotRows.map((row) => ({
      detail: row.detail,
      label: row.label,
      productName: row.productName,
    }))).toEqual([
      { detail: '', label: '', productName: 'สินค้า A - 1' },
      { detail: '', label: '', productName: 'สินค้า A - 2' },
      { detail: '', label: '', productName: 'สินค้า A - 3' },
    ])

    const html = buildReceiptPrintHtml(ticketWithThreeLots, profile)
    expect(html).toContain('สินค้า A - 1')
    expect(html).toContain('สินค้า A - 2')
    expect(html).toContain('สินค้า A - 3')
    expect(html).not.toContain('เต๋าที่ 1')
  })

  it('shows WTO subtotals only for products with multiple detail lines', () => {
    const wtoTicket: WeightTicketRecord = {
      ...ticket,
      documentNo: 'WTO190726-0001',
      lines: [
        line({
          grossWeight: '100',
          grossWeightValue: 100,
          id: 'wto-line-a-1',
          lineNo: 1,
          netWeight: 100,
          productId: 'wto-product-a',
          productName: 'Product A',
        }),
        line({
          grossWeight: '200',
          grossWeightValue: 200,
          id: 'wto-line-a-2',
          lineNo: 2,
          netWeight: 200,
          productId: 'wto-product-a',
          productName: 'Product A',
        }),
        line({
          grossWeight: '150',
          grossWeightValue: 150,
          id: 'wto-line-b-1',
          lineNo: 3,
          netWeight: 150,
          productId: 'wto-product-b',
          productName: 'Product B',
        }),
      ],
      productSummaries: [
        {
          ...ticket.productSummaries[0],
          containerDeductionWeight: 0,
          deductWeight: 0,
          grossWeight: 300,
          id: 'wto-summary-a',
          lineCount: 2,
          netWeight: 300,
          productId: 'wto-product-a',
          productName: 'Product A',
          remainingWeight: 300,
        },
        {
          ...ticket.productSummaries[1],
          containerDeductionWeight: 0,
          deductWeight: 0,
          grossWeight: 150,
          id: 'wto-summary-b',
          lineCount: 1,
          netWeight: 150,
          productId: 'wto-product-b',
          productName: 'Product B',
          remainingWeight: 150,
        },
      ],
      totals: {
        containerDeductionWeight: 0,
        deductionWeight: 0,
        grossWeight: 450,
        netWeight: 450,
      },
      type: 'WTO',
    }

    const mixedRows = buildPrintWeightRows(wtoTicket, false)
    const mixedProductTotals = mixedRows.filter((row) => row.className === 'product-total')

    expect(mixedProductTotals).toHaveLength(1)
    expect(mixedProductTotals[0]).toMatchObject({
      grossWeight: 300,
      netWeight: 300,
      productName: 'รวม Product A',
    })
    expect(mixedRows.filter((row) => row.productName === 'Product B' && row.className === 'product-total')).toHaveLength(0)

    const singleLineWtoTicket: WeightTicketRecord = {
      ...wtoTicket,
      lines: wtoTicket.lines.filter((line) => line.id !== 'wto-line-a-2'),
      productSummaries: wtoTicket.productSummaries.map((summary) => (
        summary.productId === 'wto-product-a'
          ? { ...summary, grossWeight: 100, lineCount: 1, netWeight: 100, remainingWeight: 100 }
          : summary
      )),
      totals: { ...wtoTicket.totals, grossWeight: 250, netWeight: 250 },
    }
    const singleLineRows = buildPrintWeightRows(singleLineWtoTicket, false)

    expect(singleLineRows).toHaveLength(2)
    expect(singleLineRows.every((row) => row.className !== 'product-total')).toBe(true)
    expect(singleLineRows.reduce((total, row) => total + row.netWeight, 0)).toBe(250)

    const html = buildReceiptPrintHtml(singleLineWtoTicket, profile)
    expect(html).not.toMatch(/<tr class="item-row product-total">/)
    expect(html).toContain('รวมทั้งสิ้น')

    const mixedPdfText = nodeText(WeightTicketDocument({ profile, ticket: wtoTicket }))
    expect(mixedPdfText).toContain('รวม Product A')
    expect(mixedPdfText).not.toContain('รวม Product B')
    expect(mixedPdfText).toContain('รวมทั้งสิ้น')

    const singleLinePdfText = nodeText(WeightTicketDocument({ profile, ticket: singleLineWtoTicket }))
    expect(singleLinePdfText).not.toContain('รวม Product A')
    expect(singleLinePdfText).not.toContain('รวม Product B')
    expect(singleLinePdfText).toContain('รวมทั้งสิ้น')
  })

  it('keeps the summary and signatures on one main A4 page when the item rows fit', async () => {
    await ensurePdfFontsRegistered()

    const buffer = await renderToBuffer(WeightTicketDocument({ profile, ticket }))

    expect(countPdfPages(Buffer.from(buffer))).toBe(1)
  }, 30_000)

  it('renders every real lot with traceable raw arithmetic while keeping child impurity in the product subtotal', () => {
    const html = renderToStaticMarkup(createElement(WeightTicketProductBreakdownTable, {
      onOpenLineGallery: () => undefined,
      ticket,
    }))
    const mobileHtml = html.slice(html.indexOf('</table>'))

    expect(mobileHtml).toContain('ดูรายละเอียดรายการ')
    expect(mobileHtml).toContain('<details class="group')
    expect(mobileHtml).not.toContain('<details open')

    expect(tableRowCells(html, 'เต๋าที่ 1').slice(0, 6)).toEqual([
      'เต๋าที่ 1', 'Lot 1', '205.00', '2.00', '0.00', '203.00',
    ])
    expect(tableRowCells(html, 'เต๋าที่ 2').slice(0, 6)).toEqual([
      'เต๋าที่ 2', 'Lot 2', '230.00', '2.00', '0.00', '228.00',
    ])
    expect(tableRowCells(html, '1. สินค้า A').slice(2, 6)).toEqual([
      '435.00', '4.00', '32.00', '399.00',
    ])
    expect(mobileHtml).toContain('203.00 กก.')
    expect(mobileHtml).not.toContain('171.00 กก.')
    expect(mobileHtml).toContain('228.00 กก.')
  })

  it('classifies an impurity purchase from its line relation even when the note is blank', () => {
    const relationOnlyTicket = {
      ...ticket,
      lines: ticket.lines.map((line) => line.id === 'purchase-1' ? { ...line, note: '' } : line),
    }

    const printRows = buildPrintWeightRows(relationOnlyTicket, true)
    expect(printRows.filter((row) => row.className === 'purchase-row')).toHaveLength(1)
    expect(printRows.filter((row) => row.className === 'lot-row')).toHaveLength(2)

    const html = renderToStaticMarkup(createElement(WeightTicketProductBreakdownTable, {
      onOpenLineGallery: () => undefined,
      ticket: relationOnlyTicket,
    }))
    expect(html).toContain('สิ่งเจือปนที่ซื้อ')
    expect(html).not.toContain('ซื้อเพิ่มจากสิ่งเจือปน (0 รายการ)')
  })
})
