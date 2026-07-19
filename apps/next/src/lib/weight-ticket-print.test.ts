import { describe, expect, it } from 'vitest'

import type { CompanyProfilePrintValues } from './company-profile'
import { buildReceiptPrintHtml } from './weight-ticket-print'
import type { WeightTicketRecord } from './weight-tickets'

const profile: CompanyProfilePrintValues = {
  address: 'Bangkok',
  bankInfo: null,
  branchCode: '00000',
  email: null,
  fax: null,
  footerNote: null,
  logoUrl: null,
  name: 'NS Scrap',
  nameEn: null,
  phone: '021234567',
  taxId: '0105559999999',
  website: null,
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
  lines: [],
  partyId: 'supplier-1',
  partyName: 'Supplier',
  pendingOutEvents: [],
  pendingOutHistory: [],
  productSummaries: [],
  remark: '',
  status: 'received',
  timeline: [],
  totals: {
    containerDeductionWeight: 0,
    deductionWeight: 0,
    grossWeight: 0,
    netWeight: 0,
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
  })
})
