import { renderToBuffer } from '@react-pdf/renderer'
import { Children, createElement, isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { WeightTicketProductBreakdownTable } from '@/components/daily/WeightTicketProductBreakdownTable'
import type { CompanyProfilePrintValues } from './company-profile'
import { ensurePdfFontsRegistered } from './server/pdf/fonts'
import { WeightTicketDocument } from './server/pdf/weight-ticket-document'
import { buildReceiptPrintHtml } from './weight-ticket-print'
import type { WeightTicketRecord } from './weight-tickets'

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
  return Children.toArray(node.props.children).map(nodeText).join('')
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
