import { renderToBuffer } from '@react-pdf/renderer'
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { WeightTicketProductBreakdownTable } from '@/components/daily/WeightTicketProductBreakdownTable'
import type { CompanyProfilePrintValues } from './company-profile'
import { ensurePdfFontsRegistered } from './server/pdf/fonts'
import { WeightTicketDocument } from './server/pdf/weight-ticket-document'
import {
  buildPrintWeightRows,
  buildReceiptPrintHtml,
  buildWeightTicketAttachmentImages,
  WEIGHT_TICKET_A4_ATTACHMENT_IMAGES_PER_PAGE,
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

describe('weight ticket print HTML', () => {
  it('loads the existing local Thai fonts without external stylesheets', () => {
    const html = buildReceiptPrintHtml(ticket, profile)

    expect(html).not.toMatch(/<link\b/i)
    expect(html).not.toMatch(/@import\b/i)
    expect(html).not.toContain('fonts.googleapis.com')
    expect(html).not.toContain('fonts.gstatic.com')
    expect(html).toContain("url('/fonts/NotoSansThai-Regular.ttf')")
    expect(html).toContain("url('/fonts/NotoSansThai-Bold.ttf')")
    expect(html).toContain("font-family: 'Noto Sans Thai', Arial, sans-serif")
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
})
