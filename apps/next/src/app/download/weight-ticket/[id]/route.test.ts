import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  attachWeightTicketImagePrintUrls: vi.fn(),
  findScopedWeightTicket: vi.fn(),
  generateWeightTicketPdfBuffer: vi.fn(),
  getWeightTicketUsageCounts: vi.fn(),
  loadWeightTicketCompanyPrintProfile: vi.fn(),
  mapWeightTicketRow: vi.fn(),
  resolveWeightTicketImageBucket: vi.fn(),
  drainWeightTicketImageJobs: vi.fn(),
}))

vi.mock('next/server', async (importOriginal) => ({
  ...await importOriginal<typeof import('next/server')>(),
  after: mocks.after,
}))
vi.mock('@/lib/server/api-error', () => ({
  apiErrorResponse: vi.fn((_error: unknown, message: string, status: number) => Response.json({ error: message }, { status })),
}))
vi.mock('@/lib/server/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/server/weight-tickets', () => ({
  findScopedWeightTicket: mocks.findScopedWeightTicket,
  getWeightTicketUsageCounts: mocks.getWeightTicketUsageCounts,
  mapWeightTicketRow: mocks.mapWeightTicketRow,
}))
vi.mock('@/lib/server/weight-ticket-storage', () => ({
  WeightTicketPrintReadinessError: class WeightTicketPrintReadinessError extends Error {
    code = 'WEIGHT_TICKET_PRINT_IMAGE_NOT_READY'
    status = 409
  },
  attachWeightTicketImagePrintUrls: mocks.attachWeightTicketImagePrintUrls,
  resolveWeightTicketImageBucket: mocks.resolveWeightTicketImageBucket,
}))
vi.mock('@/lib/server/weight-ticket-pdf-profile', () => ({ loadWeightTicketCompanyPrintProfile: mocks.loadWeightTicketCompanyPrintProfile }))
vi.mock('@/lib/server/weight-ticket-thumbnail-jobs', () => ({ drainWeightTicketImageJobs: mocks.drainWeightTicketImageJobs }))
vi.mock('@/lib/server/pdf/weight-ticket-pdf', () => ({ generateWeightTicketPdfBuffer: mocks.generateWeightTicketPdfBuffer }))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findScopedWeightTicket.mockResolvedValue({ id: 125n })
  mocks.getWeightTicketUsageCounts.mockResolvedValue({})
  mocks.mapWeightTicketRow.mockReturnValue({ branchId: '01', documentNo: 'WTO012608-0383', status: 'received', type: 'WTO' })
  mocks.loadWeightTicketCompanyPrintProfile.mockResolvedValue({ name: 'NS', branchCode: '01' })
  mocks.resolveWeightTicketImageBucket.mockResolvedValue('weight-ticket-images')
  mocks.attachWeightTicketImagePrintUrls.mockImplementation(async (value) => value)
  mocks.generateWeightTicketPdfBuffer.mockResolvedValue(Buffer.from('%PDF-test'))
  mocks.after.mockImplementation((callback: () => Promise<unknown>) => void callback())
})

describe('public WTI/WTO PDF route boundary', () => {
  it('drains pending print jobs for the ticket before resolving print URLs', async () => {
    const response = await GET(new Request('https://sit.example/download/weight-ticket/WTO012608-0383'), {
      params: Promise.resolve({ id: 'WTO012608-0383' }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(mocks.drainWeightTicketImageJobs).toHaveBeenCalledWith({
      attachedTicketId: 125n,
      bucket: 'weight-ticket-images',
    })
  })
})
